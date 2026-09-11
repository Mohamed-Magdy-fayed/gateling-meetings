"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/drizzle";
import {
  type OAuthProvider,
  UserCredentialsTable,
  UsersTable,
} from "@/drizzle/schema";
import { getOAuthClient } from "@/features/core/auth/core";
import { authError, normalizeEmail } from "@/features/core/auth/core/helpers";
import {
  comparePasswords,
  generateSalt,
  hashPassword,
} from "@/features/core/auth/core/passwordHasher";
import {
  createUserSession,
  removeUserFromSession,
} from "@/features/core/auth/core/session";
import { validateInput } from "@/features/core/auth/nextjs/actions/helpers";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import {
  getPostAuthRedirect,
  isSafeReturnTo,
} from "@/features/core/auth/nextjs/lib/post-auth-redirect";
import { signInSchema, signUpSchema } from "@/features/core/auth/schemas";
import type {
  AuthState,
  PartialUser,
  TypedResponse,
} from "@/features/core/auth/types";
import { getT } from "@/features/core/i18n/server";
import { inngest } from "@/integrations/inngest/client";
import { userRegisteredEvent } from "@/integrations/inngest/functions/on-user-registered";
import {
  buildRatelimitKey,
  getRequestIp,
  isRateLimited,
  signInRatelimit,
  signUpRatelimit,
} from "@/integrations/ratelimit";

export async function signInAction(
  rawInput: unknown,
  returnTo?: string,
): Promise<TypedResponse<{ user: PartialUser }>> {
  const { t } = await getT();

  let email: string;
  let password: string;
  try {
    ({ password, email } = await validateInput(signInSchema, rawInput));
  } catch (error) {
    return authError(error);
  }

  const normalizedEmail = normalizeEmail(email);

  const ip = await getRequestIp();
  if (
    await isRateLimited(signInRatelimit, buildRatelimitKey(ip, normalizedEmail))
  ) {
    return { isError: true, message: t("auth.error.rateLimited") };
  }

  let signedInUser: PartialUser | null = null;

  try {
    const user = await db.query.UsersTable.findFirst({
      columns: { id: true, email: true, name: true, emailVerifiedAt: true },
      where: eq(UsersTable.email, normalizedEmail),
      with: {
        credentials: { columns: { passwordHash: true, passwordSalt: true } },
      },
    });

    if (!user?.credentials?.passwordHash || !user.credentials?.passwordSalt) {
      return { isError: true, message: t("auth.error.credentials") };
    }

    const isValid = await comparePasswords({
      password,
      hashedPassword: user.credentials.passwordHash,
      salt: user.credentials.passwordSalt,
    });

    if (!isValid) {
      return { isError: true, message: t("auth.error.credentials") };
    }

    await createUserSession({ user, hasPassword: true }, await cookies());
    signedInUser = user;
  } catch (error) {
    return authError(error);
  }

  redirect(getPostAuthRedirect(signedInUser, returnTo));
}

export async function signUpAction(
  rawInput: unknown,
  returnTo?: string,
): Promise<TypedResponse<{ user: PartialUser }>> {
  const { t } = await getT();

  let name: string;
  let email: string;
  let phone: string;
  let password: string;
  try {
    ({ name, email, phone, password } = await validateInput(
      signUpSchema,
      rawInput,
    ));
  } catch (error) {
    return authError(error);
  }

  const normalizedEmail = normalizeEmail(email);

  const ip = await getRequestIp();
  if (
    await isRateLimited(signUpRatelimit, buildRatelimitKey(ip, normalizedEmail))
  ) {
    return { isError: true, message: t("auth.error.rateLimited") };
  }

  const user = await db.transaction(async (trx) => {
    const existing = await trx.query.UsersTable.findFirst({
      columns: { id: true },
      where: eq(UsersTable.email, normalizedEmail),
    });

    if (existing) {
      throw new Error(t("auth.signUp.error.duplicate"));
    }

    const salt = generateSalt();
    const passwordHash = await hashPassword(password, salt);

    const [createdUser] = await trx
      .insert(UsersTable)
      .values({ name, email: normalizedEmail, phone, createdBy: "self-signup" })
      .returning({
        id: UsersTable.id,
        name: UsersTable.name,
        email: UsersTable.email,
        emailVerifiedAt: UsersTable.emailVerifiedAt,
      });

    if (!createdUser) {
      throw new Error(t("auth.signUp.error.generic"));
    }

    await trx.insert(UserCredentialsTable).values({
      userId: createdUser.id,
      passwordHash,
      passwordSalt: salt,
    });

    return createdUser;
  });

  // The account already exists in the DB at this point — a failure past
  // here must not surface as a generic signup error (the client would
  // toast it and the user would retry sign-up into a duplicate-email
  // rejection). The verification email is non-critical: log and continue,
  // the user can request a resend from /auth/verify-email. Losing the
  // session is not recoverable here, so send them to sign in manually
  // instead of throwing.
  try {
    await inngest.send(userRegisteredEvent.create({ userId: user.id }));
  } catch (error) {
    console.error(
      "Failed to enqueue user/registered event after sign-up",
      error,
    );
  }

  try {
    await createUserSession({ user, hasPassword: true }, await cookies());
  } catch (error) {
    console.error("Failed to create session after sign-up", error);
    redirect("/auth/sign-in?error=session_failed");
  }

  redirect(getPostAuthRedirect(user, returnTo));
}

const OAUTH_RETURN_TO_COOKIE = "oAuthReturnTo";

export async function oAuthSignIn(provider: OAuthProvider, returnTo?: string) {
  const cookieStore = await cookies();

  if (isSafeReturnTo(returnTo)) {
    cookieStore.set(OAUTH_RETURN_TO_COOKIE, returnTo, {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });
  }

  const oAuthClient = getOAuthClient(provider);
  redirect(oAuthClient.createAuthUrl(cookieStore));
}

export async function signOutAction(): Promise<TypedResponse<void>> {
  const cookieStore = await cookies();
  await removeUserFromSession(cookieStore);
  redirect("/auth/sign-in");
}

export async function getAuth(): Promise<AuthState> {
  const user = await getCurrentUser({ withFullUser: true });
  if (!user) return { isAuthenticated: false, session: null };

  const userCredentials = await db.query.UserCredentialsTable.findFirst({
    where: eq(UserCredentialsTable.userId, user.id),
    columns: { expiresAt: true },
  });

  return {
    isAuthenticated: true,
    session: {
      user,
      hasPassword: !!(
        userCredentials &&
        (!userCredentials.expiresAt || userCredentials.expiresAt > new Date())
      ),
    },
  };
}
