import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { db } from "@/drizzle";
import {
  type OAuthProvider,
  oAuthProviderValues,
  UserOAuthAccountsTable,
  UsersTable,
} from "@/drizzle/schema";
import {
  createUserSession,
  getOAuthClient,
  getUserSession,
  normalizeEmail,
} from "@/features/core/auth/core";
import { getPostAuthRedirect } from "@/features/core/auth/nextjs/lib/post-auth-redirect";
import type { PartialUser } from "@/features/core/auth/types";

const OAUTH_RETURN_TO_COOKIE = "oAuthReturnTo";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const cookieJar = await cookies();
  const { provider: rawProvider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const { success, data: provider } = z
    .enum(oAuthProviderValues)
    .safeParse(rawProvider);

  if (typeof code !== "string" || typeof state !== "string" || !success) {
    redirect("/auth/sign-in?oauthError=oauth_failed");
  }

  const currentSession = await getUserSession(cookieJar);
  const oAuthClient = getOAuthClient(provider);

  let authenticatedUser: PartialUser | null = null;
  let didFail = false;

  try {
    const oAuthUser = await oAuthClient.fetchUser(code, state, cookieJar);
    const user = await connectUserToAccount(oAuthUser, provider, {
      currentUserId: currentSession?.user.id,
    });
    // OAuth-created sessions don't imply a password was ever set for this
    // account — sign-in/password-reset still read credentials from the DB
    // directly, so this flag is informational only.
    await createUserSession({ user, hasPassword: false }, cookieJar);
    authenticatedUser = user;
  } catch (error) {
    // Only a fixed, non-leaking code goes to the client (see
    // lib/error-codes.ts) — provider/DB error details (which can include
    // internal identifiers or query fragments) are logged server-side only.
    console.error(error);
    didFail = true;
  }

  if (didFail) {
    redirect("/auth/sign-in?oauthError=oauth_failed");
  }

  const returnTo = cookieJar.get(OAUTH_RETURN_TO_COOKIE)?.value;
  cookieJar.delete(OAUTH_RETURN_TO_COOKIE);

  redirect(getPostAuthRedirect(authenticatedUser as PartialUser, returnTo));
}

type ConnectOptions = { currentUserId?: string };

function connectUserToAccount(
  {
    id,
    email,
    name,
    imageUrl,
  }: { id: string; email: string; name: string; imageUrl?: string },
  provider: OAuthProvider,
  options: ConnectOptions = {},
): Promise<PartialUser> {
  return db.transaction(async (trx) => {
    const normalizedEmail = normalizeEmail(email);
    const userColumns = {
      id: true,
      name: true,
      email: true,
      imageUrl: true,
      emailVerifiedAt: true,
    } as const;

    const existingUser = options.currentUserId
      ? await trx.query.UsersTable.findFirst({
          columns: userColumns,
          where: eq(UsersTable.id, options.currentUserId),
        })
      : await trx.query.UsersTable.findFirst({
          columns: userColumns,
          where: eq(UsersTable.email, normalizedEmail),
        });

    let user: PartialUser | null = existingUser ?? null;

    if (user == null) {
      const [newUser] = await trx
        .insert(UsersTable)
        .values({
          name,
          email: normalizedEmail,
          emailVerifiedAt: new Date(),
          imageUrl,
          createdBy: "oauth",
        })
        .returning({
          id: UsersTable.id,
          name: UsersTable.name,
          email: UsersTable.email,
          imageUrl: UsersTable.imageUrl,
          emailVerifiedAt: UsersTable.emailVerifiedAt,
        });

      if (newUser == null) {
        throw new Error("Unable to create user from OAuth profile");
      }

      user = newUser;
    } else {
      const existingAccount = await trx.query.UserOAuthAccountsTable.findFirst({
        columns: { userId: true },
        where: and(
          eq(UserOAuthAccountsTable.provider, provider),
          eq(UserOAuthAccountsTable.providerAccountId, id),
        ),
      });

      if (existingAccount && existingAccount.userId !== user.id) {
        throw new Error("This OAuth account is already linked to another user");
      }

      if (!user.emailVerifiedAt) {
        await trx
          .update(UsersTable)
          .set({ emailVerifiedAt: new Date() })
          .where(eq(UsersTable.id, user.id));
        user = { ...user, emailVerifiedAt: new Date() };
      }
    }

    await trx
      .insert(UserOAuthAccountsTable)
      .values({ provider, providerAccountId: id, userId: user.id })
      .onConflictDoNothing();

    return user;
  });
}
