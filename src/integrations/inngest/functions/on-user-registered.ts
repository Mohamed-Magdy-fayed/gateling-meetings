import { and, eq } from "drizzle-orm";
import { eventType } from "inngest";
import { z } from "zod";

import { baseUrl } from "@/data/env/server";
import { db } from "@/drizzle";
import { UsersTable, UserTokensTable } from "@/drizzle/schema";
import {
  createTokenValue,
  EMAIL_TOKEN_TTL_MS,
  hashTokenValue,
} from "@/features/core/auth/core/token";
import { sendEmailVerificationEmail } from "@/features/core/auth/emails/send-email-verification";
import { inngest } from "../client";

export const userRegisteredEvent = eventType("user/registered", {
  schema: z.object({ userId: z.string() }),
});

export const onUserRegistered = inngest.createFunction(
  { id: "on-user-registered", triggers: [userRegisteredEvent] },
  async ({ event, step }) => {
    return step.run("create-token-and-send-verification-email", async () => {
      const user = await db.query.UsersTable.findFirst({
        where: eq(UsersTable.id, event.data.userId),
        columns: { name: true, email: true },
      });

      if (!user?.email) return { skipped: true };

      // Inngest can retry/redeliver this step — delete any prior
      // (consumed or not) email-verification token for this user first, so
      // a retry always leaves exactly one active token instead of
      // accumulating extras.
      await db
        .delete(UserTokensTable)
        .where(
          and(
            eq(UserTokensTable.userId, event.data.userId),
            eq(UserTokensTable.type, "email_verification"),
          ),
        );

      const rawToken = createTokenValue();
      await db.insert(UserTokensTable).values({
        userId: event.data.userId,
        tokenHash: hashTokenValue(rawToken),
        type: "email_verification",
        expiresAt: new Date(Date.now() + EMAIL_TOKEN_TTL_MS),
      });

      const verificationUrl = new URL("/auth/verify-email", baseUrl);
      verificationUrl.searchParams.set("token", rawToken);

      // Throws on a real delivery failure (not just "SMTP unconfigured") so
      // Inngest retries the step instead of reporting success for an email
      // that was never sent — see sendMail's own contract.
      await sendEmailVerificationEmail({
        to: user.email,
        name: user.name,
        verificationUrl: verificationUrl.toString(),
      });

      return { sent: true };
    });
  },
);
