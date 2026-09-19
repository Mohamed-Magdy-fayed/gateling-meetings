import { and, asc, desc, eq, isNull } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import { MeetingsTable } from "@/drizzle/schema";

/**
 * Soft-deleted meetings are gone for every caller, including the host.
 * Loads the owning org alongside because nearly every caller needs the
 * room's entitlements next (see `entitlementsForMeeting`).
 */
export function findMeetingByCode(db: DatabaseOrTransaction, code: string) {
  return db.query.MeetingsTable.findFirst({
    where: and(eq(MeetingsTable.code, code), isNull(MeetingsTable.deletedAt)),
    with: {
      host: { columns: { id: true, name: true, email: true } },
      organization: true,
    },
  });
}

export function findMeetingById(db: DatabaseOrTransaction, id: string) {
  return db.query.MeetingsTable.findFirst({
    where: and(eq(MeetingsTable.id, id), isNull(MeetingsTable.deletedAt)),
    with: {
      host: { columns: { id: true, name: true, email: true } },
      organization: true,
    },
  });
}

/** The dashboard's view of a meeting: never the passcode hash or salt. */
export const hostColumns = {
  id: true,
  code: true,
  title: true,
  status: true,
  scheduledAt: true,
  durationMinutes: true,
  timezone: true,
  startedAt: true,
  endedAt: true,
  isPersonalRoom: true,
  settings: true,
} as const;

/**
 * Everything a host has going in one org, the way the dashboard shows it:
 * upcoming first (soonest at the top), then live and recently ended
 * (newest at the top). The personal room is not a meeting in this sense
 * and is left out. Shared by the tRPC list and the AI companion.
 */
export async function listHostedMeetings(
  db: DatabaseOrTransaction,
  hostId: string,
  organizationId: string,
) {
  const where = and(
    eq(MeetingsTable.hostId, hostId),
    eq(MeetingsTable.organizationId, organizationId),
    isNull(MeetingsTable.deletedAt),
    eq(MeetingsTable.isPersonalRoom, false),
  );
  const [upcoming, live] = await Promise.all([
    db.query.MeetingsTable.findMany({
      where: and(where, eq(MeetingsTable.status, "scheduled")),
      orderBy: [asc(MeetingsTable.scheduledAt)],
      limit: 50,
      columns: hostColumns,
    }),
    db.query.MeetingsTable.findMany({
      where: and(where, eq(MeetingsTable.status, "live")),
      orderBy: [desc(MeetingsTable.startedAt)],
      limit: 20,
      columns: hostColumns,
    }),
  ]);
  const ended = await db.query.MeetingsTable.findMany({
    where: and(where, eq(MeetingsTable.status, "ended")),
    orderBy: [desc(MeetingsTable.endedAt)],
    limit: 20,
    columns: hostColumns,
  });
  return { upcoming, live, ended };
}
