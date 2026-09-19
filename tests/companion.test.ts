import { describe, expect, it } from "vitest";

import {
  dayKey,
  monthKey,
  nextDailyReset,
} from "@/features/companion/lib/allowance";
import { buildSystemPrompt } from "@/features/companion/server/prompt";
import { companionSchemas } from "@/features/companion/server/schemas";

const NOW = new Date("2026-09-19T21:30:00Z");

describe("companion prompt", () => {
  const prompt = buildSystemPrompt({
    now: NOW,
    timeZone: "Africa/Cairo",
    locale: "ar",
    userName: "Muhammad",
    organizationName: "Gateling",
    entitlements: {
      maxParticipants: 5,
      maxMeetingMinutes: 40,
      maxUpcomingScheduled: 3,
    },
  });

  it("anchors time to the person's zone and asks for Arabic", () => {
    expect(prompt).toContain("2026-09-19T21:30:00.000Z");
    expect(prompt).toContain("Africa/Cairo");
    expect(prompt).toContain("Answer in Arabic");
  });

  it("states the plan's caps and stays on topic", () => {
    expect(prompt).toContain("up to 5 people");
    expect(prompt).toContain("40 minutes");
    expect(prompt).toContain("at most 3 upcoming");
    expect(prompt).toMatch(/Only help with meetings/);
  });

  it("spells the coming week out so weekday arithmetic is not guessed", () => {
    // 21:30Z on Saturday the 19th is already Sunday 00:30 in Cairo, so the
    // week ahead starts on Monday the 21st.
    expect(prompt).toContain(
      "The coming week there: Mon 2026-09-21, Tue 2026-09-22, Wed 2026-09-23, Thu 2026-09-24, Fri 2026-09-25, Sat 2026-09-26, Sun 2026-09-27.",
    );
  });

  it("turns repeats into a series and refuses to shrink a request silently", () => {
    expect(prompt).toContain("call schedule_meeting_series once");
    expect(prompt).toContain("at most 12");
    expect(prompt).toContain("Never quietly do a smaller part of the request");
  });

  it("spells unlimited caps out instead of printing MAX_SAFE_INTEGER", () => {
    const unlimited = buildSystemPrompt({
      now: NOW,
      timeZone: "UTC",
      locale: "en",
      userName: "A",
      organizationName: "B",
      entitlements: {
        maxParticipants: Number.MAX_SAFE_INTEGER,
        maxMeetingMinutes: null,
        maxUpcomingScheduled: null,
      },
    });
    expect(unlimited).toContain("up to unlimited people");
    expect(unlimited).toContain("no length limit");
    expect(unlimited).not.toContain(String(Number.MAX_SAFE_INTEGER));
  });
});

describe("companion tool inputs", () => {
  it("accepts a wall-clock time with a zone and emails", () => {
    const parsed = companionSchemas.scheduleMeeting.parse({
      title: "Design review",
      wallClock: "2026-09-20T12:00",
      timezone: "Africa/Cairo",
      invitees: ["a@example.test", "b@example.test"],
    });
    expect(parsed.durationMinutes).toBeUndefined();
    expect(parsed.invitees).toHaveLength(2);
  });

  it("rejects an ISO instant, a bad zone and a bad email", () => {
    const base = {
      title: "x",
      wallClock: "2026-09-20T12:00",
      timezone: "Africa/Cairo",
    };
    expect(
      companionSchemas.scheduleMeeting.safeParse({
        ...base,
        wallClock: "2026-09-20T12:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      companionSchemas.scheduleMeeting.safeParse({
        ...base,
        timezone: "Mars/Olympus",
      }).success,
    ).toBe(false);
    expect(
      companionSchemas.scheduleMeeting.safeParse({
        ...base,
        invitees: ["not-an-email"],
      }).success,
    ).toBe(false);
  });

  it("takes a series of wall-clock times, two to twelve of them", () => {
    const base = { title: "Sunday sync", timezone: "Africa/Cairo" };
    const sundays = Array.from(
      { length: 4 },
      (_, i) => `2026-09-${String(20 + i * 7).padStart(2, "0")}T11:00`,
    );
    expect(
      companionSchemas.scheduleMeetingSeries.parse({
        ...base,
        wallClocks: sundays,
      }).wallClocks,
    ).toEqual(sundays);
    expect(
      companionSchemas.scheduleMeetingSeries.safeParse({
        ...base,
        wallClocks: sundays.slice(0, 1),
      }).success,
    ).toBe(false);
    expect(
      companionSchemas.scheduleMeetingSeries.safeParse({
        ...base,
        wallClocks: Array.from({ length: 13 }, () => "2026-09-20T11:00"),
      }).success,
    ).toBe(false);
    expect(
      companionSchemas.scheduleMeetingSeries.safeParse({
        ...base,
        wallClocks: ["2026-09-20T11:00", "2026-09-27T11:00:00Z"],
      }).success,
    ).toBe(false);
  });

  it("requires a meeting code where one is needed", () => {
    expect(
      companionSchemas.meetingByCode.safeParse({ code: "abc-defg-hij" })
        .success,
    ).toBe(true);
    expect(
      companionSchemas.meetingByCode.safeParse({ code: "nope" }).success,
    ).toBe(false);
  });
});

describe("companion allowance keys", () => {
  it("buckets by UTC day and month and resets at the next UTC midnight", () => {
    expect(dayKey(NOW)).toBe("2026-09-19");
    expect(monthKey(NOW)).toBe("2026-09");
    expect(nextDailyReset(NOW).toISOString()).toBe("2026-09-20T00:00:00.000Z");
  });
});
