import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { DatabaseOrTransaction } from "@/drizzle";
import {
  type OrganizationRole,
  organizationRoleValues,
  UserTokensTable,
} from "@/drizzle/schema";
import { normalizeEmail } from "@/features/core/auth/core/helpers";
import {
  createTokenValue,
  hashTokenValue,
} from "@/features/core/auth/core/token";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * What an `org_invite` token row carries. Stored in `user_tokens.metadata`
 * — the table already has hashing, expiry and single-use semantics, so an
 * invitation is one more token type rather than a new table.
 */
export const inviteMetadataSchema = z.object({
  organizationId: z.uuid(),
  email: z.string(),
  role: z.enum(organizationRoleValues),
  invitedBy: z.uuid(),
});
export type InviteMetadata = z.infer<typeof inviteMetadataSchema>;

export function parseInviteMetadata(metadata: unknown): InviteMetadata | null {
  const parsed = inviteMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
}

/** Pending, unexpired invites for one org — the "seats spoken for" count. */
export function pendingInvitesWhere(organizationId: string, now = new Date()) {
  return and(
    eq(UserTokensTable.type, "org_invite"),
    isNull(UserTokensTable.consumedAt),
    gt(UserTokensTable.expiresAt, now),
    sql`${UserTokensTable.metadata}->>'organizationId' = ${organizationId}`,
  );
}

export async function listPendingInvites(
  db: DatabaseOrTransaction,
  organizationId: string,
) {
  const rows = await db.query.UserTokensTable.findMany({
    where: pendingInvitesWhere(organizationId),
    orderBy: (table, { desc }) => [desc(table.createdAt)],
  });
  return rows.flatMap((row) => {
    const metadata = parseInviteMetadata(row.metadata);
    return metadata
      ? [
          {
            id: row.id,
            email: metadata.email,
            role: metadata.role,
            invitedBy: metadata.invitedBy,
            expiresAt: row.expiresAt,
            createdAt: row.createdAt,
          },
        ]
      : [];
  });
}

/**
 * Issues an invite, replacing any pending one for the same address so an
 * email only ever has one live link. Returns the raw token exactly once —
 * it goes into the email and the "copy link" button, never a table.
 */
export async function createInvite(
  db: DatabaseOrTransaction,
  input: {
    organizationId: string;
    email: string;
    role: OrganizationRole;
    invitedBy: string;
  },
): Promise<{ id: string; token: string; expiresAt: Date }> {
  const email = normalizeEmail(input.email);
  await db
    .delete(UserTokensTable)
    .where(
      and(
        pendingInvitesWhere(input.organizationId),
        sql`${UserTokensTable.metadata}->>'email' = ${email}`,
      ),
    );
  const token = createTokenValue();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const metadata: InviteMetadata = {
    organizationId: input.organizationId,
    email,
    role: input.role,
    invitedBy: input.invitedBy,
  };
  const [row] = await db
    .insert(UserTokensTable)
    .values({
      userId: null,
      tokenHash: hashTokenValue(token),
      type: "org_invite",
      expiresAt,
      metadata,
    })
    .returning({ id: UserTokensTable.id });
  if (!row) throw new Error("invite insert returned no row");
  return { id: row.id, token, expiresAt };
}

/** The live invite behind a raw token, or null if unknown, used or expired. */
export async function findLiveInvite(db: DatabaseOrTransaction, token: string) {
  const row = await db.query.UserTokensTable.findFirst({
    where: and(
      eq(UserTokensTable.tokenHash, hashTokenValue(token)),
      eq(UserTokensTable.type, "org_invite"),
      isNull(UserTokensTable.consumedAt),
      gt(UserTokensTable.expiresAt, new Date()),
    ),
  });
  if (!row) return null;
  const metadata = parseInviteMetadata(row.metadata);
  return metadata ? { id: row.id, metadata } : null;
}

/** Raw token → row id lookup for the email job, which stores no token. */
export function inviteUrl(baseUrl: string, token: string) {
  return `${baseUrl}/invite/${encodeURIComponent(token)}`;
}
