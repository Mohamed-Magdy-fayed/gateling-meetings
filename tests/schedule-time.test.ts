import { describe, expect, it } from "vitest";

import {
  instantToWallClock,
  offsetMinutes,
  wallClockToInstant,
} from "@/features/meetings/lib/schedule-time";

describe("wallClockToInstant", () => {
  it("converts a Cairo wall-clock time to UTC (UTC+3 in summer)", () => {
    expect(
      wallClockToInstant("2026-07-15T15:30", "Africa/Cairo").toISOString(),
    ).toBe("2026-07-15T12:30:00.000Z");
  });

  it("converts a Cairo wall-clock time to UTC (UTC+2 in winter)", () => {
    expect(
      wallClockToInstant("2026-01-15T15:30", "Africa/Cairo").toISOString(),
    ).toBe("2026-01-15T13:30:00.000Z");
  });

  it("handles a zone west of UTC", () => {
    expect(
      wallClockToInstant("2026-03-01T09:00", "America/New_York").toISOString(),
    ).toBe("2026-03-01T14:00:00.000Z");
  });

  it("round-trips through instantToWallClock", () => {
    const local = "2026-11-05T08:15";
    const instant = wallClockToInstant(local, "Asia/Riyadh");
    expect(instantToWallClock(instant, "Asia/Riyadh")).toBe(local);
  });

  it("rejects garbage", () => {
    expect(() => wallClockToInstant("tomorrow", "UTC")).toThrow();
  });
});

describe("offsetMinutes", () => {
  it("is 0 for UTC and 180 for Cairo in summer", () => {
    const summer = new Date("2026-07-01T00:00:00Z");
    expect(offsetMinutes(summer, "UTC")).toBe(0);
    expect(offsetMinutes(summer, "Africa/Cairo")).toBe(180);
  });
});
