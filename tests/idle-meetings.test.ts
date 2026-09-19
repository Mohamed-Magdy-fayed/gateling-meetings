import { describe, expect, it } from "vitest";

import {
  IDLE_MEETING_MS,
  idleCutoff,
  isIdleSince,
} from "@/features/meetings/lib/idle";

const NOW = new Date("2026-09-19T12:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

function meeting(overrides: Partial<Parameters<typeof isIdleSince>[0]> = {}) {
  return {
    status: "live" as const,
    isPersonalRoom: false,
    startedAt: ago(IDLE_MEETING_MS + 1000),
    createdAt: ago(2 * IDLE_MEETING_MS),
    deletedAt: null,
    ...overrides,
  };
}

describe("isIdleSince", () => {
  it("flags a live meeting whose last session started before the window", () => {
    expect(isIdleSince(meeting(), NOW)).toBe(true);
  });

  it("uses the creation time when the room never started", () => {
    expect(isIdleSince(meeting({ startedAt: null }), NOW)).toBe(true);
    expect(
      isIdleSince(meeting({ startedAt: null, createdAt: ago(60_000) }), NOW),
    ).toBe(false);
  });

  it("leaves a recently (re)started room alone", () => {
    expect(isIdleSince(meeting({ startedAt: ago(60_000) }), NOW)).toBe(false);
  });

  it("never touches personal rooms, deleted rows or non-live meetings", () => {
    expect(isIdleSince(meeting({ isPersonalRoom: true }), NOW)).toBe(false);
    expect(isIdleSince(meeting({ deletedAt: NOW }), NOW)).toBe(false);
    expect(isIdleSince(meeting({ status: "scheduled" }), NOW)).toBe(false);
    expect(isIdleSince(meeting({ status: "ended" }), NOW)).toBe(false);
  });

  it("idleCutoff is exactly the window before now", () => {
    expect(idleCutoff(NOW).getTime()).toBe(NOW.getTime() - IDLE_MEETING_MS);
  });
});
