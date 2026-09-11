import { describe, expect, it } from "vitest";

import {
  buildIcs,
  googleCalendarUrl,
  toIcsUtc,
} from "@/features/meetings/lib/calendar";

const event = {
  uid: "abc-defg-hij@meet.gateling.com",
  title: "Weekly sync; planning, review",
  description: "Join here:\nhttps://meet.gateling.com/m/abc-defg-hij",
  url: "https://meet.gateling.com/m/abc-defg-hij",
  start: new Date("2026-09-15T14:30:00.000Z"),
  end: new Date("2026-09-15T15:00:00.000Z"),
  organizer: { name: "Test Host", email: "host@example.test" },
};

describe("toIcsUtc", () => {
  it("formats as basic ISO 8601 in UTC", () => {
    expect(toIcsUtc(event.start)).toBe("20260915T143000Z");
  });
});

describe("buildIcs", () => {
  const ics = buildIcs(event, new Date("2026-09-11T10:00:00.000Z"));

  it("is a REQUEST with one confirmed event and CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:REQUEST\r\n");
    expect(ics).toContain("STATUS:CONFIRMED\r\n");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("carries uid, times, organizer and url", () => {
    expect(ics).toContain("UID:abc-defg-hij@meet.gateling.com");
    expect(ics).toContain("DTSTART:20260915T143000Z");
    expect(ics).toContain("DTEND:20260915T150000Z");
    expect(ics).toContain("DTSTAMP:20260911T100000Z");
    expect(ics).toContain('ORGANIZER;CN="Test Host":mailto:host@example.test');
    expect(ics).toContain("URL:https://meet.gateling.com/m/abc-defg-hij");
  });

  it("escapes semicolons, commas and newlines in text values", () => {
    expect(ics).toContain("SUMMARY:Weekly sync\\; planning\\, review");
    expect(ics).toContain("DESCRIPTION:Join here:\\nhttps://");
  });

  it("folds long lines at 75 octets", () => {
    const long = buildIcs({ ...event, description: "x".repeat(200) });
    const lines = long.split("\r\n");
    const index = lines.findIndex((line) => line.startsWith("DESCRIPTION:"));
    expect(lines[index]?.length).toBeLessThanOrEqual(75);
    expect(lines[index + 1]?.startsWith(" ")).toBe(true);
  });
});

describe("googleCalendarUrl", () => {
  it("builds the TEMPLATE deep link with UTC dates", () => {
    const url = new URL(googleCalendarUrl(event));
    expect(url.origin + url.pathname).toBe(
      "https://calendar.google.com/calendar/render",
    );
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe(
      "20260915T143000Z/20260915T150000Z",
    );
    expect(url.searchParams.get("location")).toBe(event.url);
  });
});
