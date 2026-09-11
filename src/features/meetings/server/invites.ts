import crypto from "node:crypto";

import type { DatabaseOrTransaction } from "@/drizzle";
import { MeetingInvitesTable } from "@/drizzle/schema";
import { normalizeEmail } from "@/features/core/auth/core/helpers";

/**
 * Inserts one invite per unique email, skipping addresses already invited
 * to this meeting (the unique index makes the re-send a no-op rather than
 * an error). Returns only the *new* rows so the caller emails exactly those.
 */
export async function createInvites(
  db: DatabaseOrTransaction,
  meetingId: string,
  emails: string[],
) {
  const unique = [...new Set(emails.map(normalizeEmail))];
  if (unique.length === 0) return [];

  return db
    .insert(MeetingInvitesTable)
    .values(
      unique.map((email) => ({
        meetingId,
        email,
        token: crypto.randomBytes(24).toString("base64url"),
      })),
    )
    .onConflictDoNothing()
    .returning({
      id: MeetingInvitesTable.id,
      email: MeetingInvitesTable.email,
    });
}
