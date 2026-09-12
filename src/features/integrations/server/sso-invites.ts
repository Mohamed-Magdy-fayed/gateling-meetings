import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  type Integration,
  type Meeting,
  MeetingInvitesTable,
} from "@/drizzle/schema";
import { normalizeEmail } from "@/features/core/auth/core/helpers";
import type { SsoClaims } from "@/integrations/sso/token";

/**
 * A participant arriving through `/sso/join` gets the same credential an
 * emailed invitee has — a `meeting_invites` row — so `join.request` treats
 * them identically (no passcode, no waiting room) and nothing there changes.
 * One row per person per meeting: a second link for the same external id
 * reuses the row, so the host's invitee list stays honest.
 */
export async function ensureSsoInvite(
  db: Database,
  integration: Pick<Integration, "slug">,
  meeting: Pick<Meeting, "id">,
  claims: Pick<SsoClaims, "externalId" | "name" | "email">,
): Promise<string> {
  const email = claims.email
    ? normalizeEmail(claims.email)
    : placeholderEmail(integration.slug, claims.externalId);

  const existing = await db.query.MeetingInvitesTable.findFirst({
    where: and(
      eq(MeetingInvitesTable.meetingId, meeting.id),
      eq(MeetingInvitesTable.email, email),
    ),
    columns: { token: true },
  });
  if (existing) return existing.token;

  const token = crypto.randomBytes(24).toString("base64url");
  const [inserted] = await db
    .insert(MeetingInvitesTable)
    .values({
      meetingId: meeting.id,
      email,
      name: claims.name,
      token,
      // Nothing to send: the person is already on their way to the room.
      sentAt: new Date(),
      // A placeholder address can never receive the reminder; marking it
      // reminded keeps the reminder job from trying (and failing) anyway.
      remindedAt: claims.email ? null : new Date(),
    })
    .onConflictDoNothing()
    .returning({ token: MeetingInvitesTable.token });
  if (inserted) return inserted.token;

  // Lost a race with an identical request; the winner's row is the answer.
  const raced = await db.query.MeetingInvitesTable.findFirst({
    where: and(
      eq(MeetingInvitesTable.meetingId, meeting.id),
      eq(MeetingInvitesTable.email, email),
    ),
    columns: { token: true },
  });
  if (!raced) throw new Error("invite row vanished");
  return raced.token;
}

/** See `pickEmail` in linked-users.ts — same reserved-TLD placeholder idea. */
function placeholderEmail(slug: string, externalId: string) {
  const digest = crypto
    .createHash("sha256")
    .update(`${slug}:${externalId}`)
    .digest("hex")
    .slice(0, 24);
  return `guest-${digest}@${slug}.invalid`;
}
