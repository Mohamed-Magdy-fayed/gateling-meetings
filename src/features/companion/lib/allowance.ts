/** Pure date bucketing for the companion's counters — no Redis, testable. */

/** `YYYY-MM-DD` in UTC — the allowance resets at midnight UTC for everyone. */
export function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

/** The instant the daily allowance resets: the next UTC midnight. */
export function nextDailyReset(now: Date): Date {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}
