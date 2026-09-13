import {
  instantToWallClock,
  wallClockToInstant,
} from "@/features/meetings/lib/schedule-time";

/** The admin's own zone — plan expiries are typed as the operator sees the clock. */
function browserZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function toLocalDateTime(date: Date | null | undefined): string {
  return date ? instantToWallClock(date, browserZone()) : "";
}

export function fromLocalDateTime(value: string): Date | null {
  if (!value.trim()) return null;
  try {
    return wallClockToInstant(value, browserZone());
  } catch {
    return null;
  }
}
