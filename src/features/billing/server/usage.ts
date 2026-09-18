import { and, count, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import { MeetingParticipantsTable, MeetingsTable } from "@/drizzle/schema";
import {
  assertEntitlement,
  type Entitlements,
  monthWindow,
} from "@/features/billing/plans";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TFunction } from "@/features/core/i18n/lib";

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

/**
 * A connection still open after this long is a lost `participant_left`
 * webhook, not a day-long call; it stops accruing minutes at the window.
 */
const OPEN_CONNECTION_CAP_MS = ACTIVE_WINDOW_MS;

export type MonthlyUsage = {
  /** Participant-minutes the org has consumed this UTC calendar month. */
  participantMinutes: number;
  /** When the count starts again from zero. */
  resetsAt: Date;
};

/**
 * Participant-minutes across every meeting the org owns, summed from the
 * attendance log for connections that started this calendar month. An
 * open connection counts up to `now` (capped, see above), so a room in
 * progress is already on the meter and the next join sees it.
 */
export async function monthlyParticipantMinutes(
  db: DatabaseOrTransaction,
  organizationId: string,
  now: Date = new Date(),
): Promise<MonthlyUsage> {
  const { start, end } = monthWindow(now);
  const capSeconds = sql.raw(String(OPEN_CONNECTION_CAP_MS / 1000));
  // A bare Date in a `sql` template is not serialised by the driver; a
  // column comparison (`gte(joinedAt, start)`) is, hence the ISO string here.
  const openUntil = sql`least(${now.toISOString()}::timestamptz, ${MeetingParticipantsTable.joinedAt} + make_interval(secs => ${capSeconds}))`;
  const [row] = await db
    .select({
      seconds:
        sql<number>`coalesce(sum(extract(epoch from (coalesce(${MeetingParticipantsTable.leftAt}, ${openUntil}) - ${MeetingParticipantsTable.joinedAt}))), 0)`.mapWith(
          Number,
        ),
    })
    .from(MeetingParticipantsTable)
    .innerJoin(
      MeetingsTable,
      eq(MeetingsTable.id, MeetingParticipantsTable.meetingId),
    )
    .where(
      and(
        eq(MeetingsTable.organizationId, organizationId),
        gte(MeetingParticipantsTable.joinedAt, start),
        lt(MeetingParticipantsTable.joinedAt, end),
      ),
    );
  return {
    participantMinutes: Math.floor(Math.max(row?.seconds ?? 0, 0) / 60),
    resetsAt: end,
  };
}

/**
 * The monthly allowance, checked wherever someone is about to be put in a
 * room. Plans without a cap skip the query entirely.
 */
export async function assertMonthlyAllowance(
  db: DatabaseOrTransaction,
  t: TFunction<typeof mainTranslations>,
  organizationId: string,
  entitlements: Entitlements,
): Promise<void> {
  if (entitlements.maxMonthlyParticipantMinutes == null) return;
  const usage = await monthlyParticipantMinutes(db, organizationId);
  assertEntitlement(
    t,
    entitlements,
    "maxMonthlyParticipantMinutes",
    usage.participantMinutes,
  );
}
