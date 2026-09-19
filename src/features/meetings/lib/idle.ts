/**
 * How long a live meeting may sit with nobody in it before the app ends it.
 * LiveKit closes an emptied room after a few minutes and `room_finished`
 * ends the meeting then; this is the backstop for meetings that never got
 * a room (an instant meeting nobody joined) or whose webhook never came.
 */
export const IDLE_MEETING_MS = 30 * 60 * 1000;

export type IdleCandidate = {
  status: "scheduled" | "live" | "ended";
  isPersonalRoom: boolean;
  /** Re-stamped on every `room_started`, so it doubles as "last activity". */
  startedAt: Date | null;
  createdAt: Date;
  deletedAt: Date | null;
};

/** The instant before which a live meeting counts as idle. */
export function idleCutoff(now: Date): Date {
  return new Date(now.getTime() - IDLE_MEETING_MS);
}

/**
 * True when the meeting is a live, non-personal room whose last activity
 * clock is older than the idle window. Occupancy is *not* part of this —
 * the caller confirms the room is actually empty before ending it.
 */
export function isIdleSince(meeting: IdleCandidate, now: Date): boolean {
  if (meeting.status !== "live") return false;
  if (meeting.isPersonalRoom || meeting.deletedAt) return false;
  const lastActivity = meeting.startedAt ?? meeting.createdAt;
  return lastActivity.getTime() < idleCutoff(now).getTime();
}
