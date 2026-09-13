import { and, count, eq, gt, isNull } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import { MeetingParticipantsTable, MeetingsTable } from "@/drizzle/schema";

/** Scheduled meetings that have not started yet, across the org. */
export async function countUpcomingScheduled(
  db: DatabaseOrTransaction,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(MeetingsTable)
    .where(
      and(
        eq(MeetingsTable.organizationId, organizationId),
        eq(MeetingsTable.status, "scheduled"),
        isNull(MeetingsTable.deletedAt),
      ),
    );
  return row?.value ?? 0;
}

/**
 * Bounded to the last day so a lost `participant_left` webhook cannot pin
 * a seat forever. This is the cheap check; the join door confirms against
 * LiveKit only when this says the room is at capacity.
 */
const ACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function countActiveParticipants(
  db: DatabaseOrTransaction,
  meetingId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(MeetingParticipantsTable)
    .where(
      and(
        eq(MeetingParticipantsTable.meetingId, meetingId),
        isNull(MeetingParticipantsTable.leftAt),
        gt(
          MeetingParticipantsTable.joinedAt,
          new Date(Date.now() - ACTIVE_WINDOW_MS),
        ),
      ),
    );
  return row?.value ?? 0;
}
