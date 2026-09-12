import { and, desc, eq, isNull } from "drizzle-orm";

import { baseUrl } from "@/data/env/server";
import type { Database } from "@/drizzle";
import { type Meeting, MeetingsTable } from "@/drizzle/schema";
import { findMeetingByCode } from "@/features/meetings/server/queries";
import { meetingNotFound } from "@/integrations/api/respond";

/**
 * What an integration sees of a meeting. Never the passcode hash or salt;
 * `guestUrl` is the plain share link (passcode + waiting room apply), the
 * SSO links come from `/join-links`.
 */
export function toApiMeeting(meeting: Meeting) {
  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    status: meeting.status,
    externalRef: meeting.externalRef,
    scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
    durationMinutes: meeting.durationMinutes,
    timezone: meeting.timezone,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    endedAt: meeting.endedAt?.toISOString() ?? null,
    settings: meeting.settings,
    hasPasscode: meeting.passcodeHash != null,
    guestUrl: `${baseUrl}/m/${meeting.code}`,
    createdAt: meeting.createdAt.toISOString(),
  };
}

export type ApiMeeting = ReturnType<typeof toApiMeeting>;

/**
 * Tenancy in one place: a meeting that exists but belongs to someone else
 * is indistinguishable from one that does not exist.
 */
export async function requireIntegrationMeeting(
  db: Database,
  integrationId: string,
  code: string,
) {
  const meeting = await findMeetingByCode(db, code);
  if (!meeting || meeting.integrationId !== integrationId) {
    throw meetingNotFound();
  }
  return meeting;
}

export function listIntegrationMeetings(
  db: Database,
  integrationId: string,
  filters: {
    externalRef?: string;
    status?: Meeting["status"];
    limit: number;
  },
) {
  return db.query.MeetingsTable.findMany({
    where: and(
      eq(MeetingsTable.integrationId, integrationId),
      isNull(MeetingsTable.deletedAt),
      filters.externalRef
        ? eq(MeetingsTable.externalRef, filters.externalRef)
        : undefined,
      filters.status ? eq(MeetingsTable.status, filters.status) : undefined,
    ),
    orderBy: [desc(MeetingsTable.createdAt)],
    limit: filters.limit,
  });
}
