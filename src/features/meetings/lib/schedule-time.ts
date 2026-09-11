/**
 * Wall-clock ↔ instant conversion for the schedule form, using only `Intl`.
 * A person picks "15:30 on Sept 15" in a chosen zone; the server stores the
 * instant. Both directions are pure so they are unit tested against DST.
 */

/** `"2026-09-15T15:30"` in `timeZone` → the UTC instant. */
export function wallClockToInstant(local: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!match) throw new Error(`Not a wall-clock time: ${local}`);
  const [, y, mo, d, h, mi] = match.map(Number) as number[];
  // First guess: treat the wall clock as UTC, then correct by the zone's
  // offset at that instant. One correction is exact except across a DST
  // switch, where a second pass settles it.
  let guess = Date.UTC(y as number, (mo as number) - 1, d, h, mi);
  for (let i = 0; i < 2; i++) {
    const offset = offsetMinutes(new Date(guess), timeZone);
    const corrected =
      Date.UTC(y as number, (mo as number) - 1, d, h, mi) - offset * 60_000;
    if (corrected === guess) break;
    guess = corrected;
  }
  return new Date(guess);
}

/** The instant → `"YYYY-MM-DDTHH:mm"` as seen on a clock in `timeZone`. */
export function instantToWallClock(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Minutes east of UTC for `timeZone` at `date` (e.g. Cairo in summer → 180). */
export function offsetMinutes(date: Date, timeZone: string): number {
  const wall = instantToWallClock(date, timeZone);
  const asUtc = Date.UTC(
    Number(wall.slice(0, 4)),
    Number(wall.slice(5, 7)) - 1,
    Number(wall.slice(8, 10)),
    Number(wall.slice(11, 13)),
    Number(wall.slice(14, 16)),
  );
  const truncated = Math.floor(date.getTime() / 60_000) * 60_000;
  return Math.round((asUtc - truncated) / 60_000);
}

/** The browser's zone, with a safe fallback for very old engines. */
export function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Every zone the runtime knows, for the picker. */
export function allTimeZones(): string[] {
  const intl = Intl as unknown as {
    supportedValuesOf?: (key: string) => string[];
  };
  return intl.supportedValuesOf?.("timeZone") ?? ["UTC"];
}
