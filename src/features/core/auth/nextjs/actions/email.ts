"use server";

import { and, eq, ne } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { baseUrl } from "@/data/env/server";
import { db } from "@/drizzle";
import { UsersTable, UserTokensTable } from "@/drizzle/schema";
import {
  getUserSession,
  updateUserSessionData,
} from "@/features/core/auth/core";
import {
  createTokenValue,
  EMAIL_TOKEN_TTL_MS,
  hashTokenValue,
} from "@/features/core/auth/core/token";
import { sendEmailVerificationEmail } from "@/features/core/auth/emails/send-email-verification";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import type { TypedResponse } from "@/features/core/auth/types";
import { getT } from "@/features/core/i18n/server";

const verifyEmailTokenSchema = z.object({ token: z.string().min(1) });

export async function beginEmailVerificationAction(): Promise<
  TypedResponse<{ sent: true }>
> {
  const { t } = await getT();
  const { id: userId } = await getCurrentUser({ redirectIfNotFound: true });

  const user = await db.query.UsersTable.findFirst({
    where: eq(UsersTable.id, userId),
    columns: { id: true, email: true, name: true },
  });

  if (!user?.email) {
    return {
      isError: true,
      message: t("auth.emailVerification.error.missingEmail"),
    };
  }

  const token = createTokenValue();
  const tokenHash = hashTokenValue(token);
  const expiresAt = new Date(Date.now() + EMAIL_TOKEN_TTL_MS);

  await db.transaction(async (trx) => {
    await trx
      .delete(UserTokensTable)
      .where(
        and(
          eq(UserTokensTable.userId, user.id),
          eq(UserTokensTable.type, "email_verification"),
        ),
      );

    await trx.insert(UserTokensTable).values({
      userId: user.id,
      tokenHash,
      type: "email_verification",
      expiresAt,
    });
  });

  const verificationUrl = new URL("/auth/verify-email", baseUrl);
  verificationUrl.searchParams.set("token", token);

  try {
    await sendEmailVerificationEmail({
      to: user.email,
      name: user.name,
      verificationUrl: verificationUrl.toString(),
    });
  } catch {
    return {
      isError: true,
      message: t("auth.emailVerification.error.sendFailed"),
    };
  }

  return { isError: false, sent: true };
}

export async function verifyEmailTokenAction(
  rawInput: z.infer<typeof verifyEmailTokenSchema>,
): Promise<TypedResponse<{ status: "verified" }>> {
  const { t } = await getT();
  const parsed = verifyEmailTokenSchema.safeParse(rawInput);
  if (!parsed.success) {
    return {
      isError: true,
      message: t("auth.emailVerification.error.invalidToken"),
    };
  }

  const tokenHash = hashTokenValue(parsed.data.token);
  const record = await db.query.UserTokensTable.findFirst({
    columns: { id: true, userId: true, expiresAt: true, consumedAt: true },
    where: and(
      eq(UserTokensTable.tokenHash, tokenHash),
      eq(UserTokensTable.type, "email_verification"),
    ),
  });

  const userId = record?.userId;
  if (!record || !userId) {
    return {
      isError: true,
      message: t("auth.emailVerification.error.invalidToken"),
    };
  }

  const now = new Date();
  if (
    record.consumedAt != null ||
    record.expiresAt.getTime() <= now.getTime()
  ) {
    return {
      isError: true,
      message: t("auth.emailVerification.error.expired"),
    };
  }

  const [user] = await db.transaction(async (trx) => {
    const [updatedUser] = await trx
      .update(UsersTable)
      .set({ emailVerifiedAt: now })
      .where(eq(UsersTable.id, userId))
      .returning({
        id: UsersTable.id,
        email: UsersTable.email,
        name: UsersTable.name,
      });
    await trx
      .update(UserTokensTable)
      .set({ consumedAt: now })
      .where(eq(UserTokensTable.id, record.id));
    await trx
      .delete(UserTokensTable)
      .where(
        and(
          eq(UserTokensTable.userId, userId),
          eq(UserTokensTable.type, "email_verification"),
          ne(UserTokensTable.id, record.id),
        ),
      );
    return [updatedUser];
  });

  // Only refresh the active session's cached user data when it belongs to
  // the same account the token was issued for — otherwise a signed-in third
  // party who happens to click someone else's verification link could end
  // up with their own session overwritten by that other account's data.
  const cookieStore = await cookies();
  const activeSession = await getUserSession(cookieStore);
  if (activeSession?.user.id === userId && user) {
    await updateUserSessionData(
      { ...activeSession.user, emailVerifiedAt: now },
      cookieStore,
    );
  }

  return { isError: false, status: "verified" };
}
