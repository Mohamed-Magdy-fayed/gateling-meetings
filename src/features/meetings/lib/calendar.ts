/**
 * Calendar helpers with no dependencies: an RFC 5545 `.ics` body and the
 * "Add to Google Calendar" template URL. Both are pure so they are unit
 * tested without touching mail or the database.
 */

export type CalendarEvent = {
  /** Stable across re-sends so a calendar *updates* the event, not duplicates it. */
  uid: string;
  title: string;
  description: string;
  /** Absolute join link. */
  url: string;
  start: Date;
  end: Date;
  organizer?: { name: string; email: string };
  /** Bumped on every re-send so calendars accept the newer version. */
  sequence?: number;
};

/** `2026-09-11T14:30:00.000Z` → `20260911T143000Z` */
export function toIcsUtc(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

/** RFC 5545 §3.3.11: escape backslash, semicolon, comma and newlines in text values. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + space. */
function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length === 0 ? 75 : 74;
    if (encoder.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else {
      current += char;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(event: CalendarEvent, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Gateling Meetings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(event.start)}`,
    `DTEND:${toIcsUtc(event.end)}`,
    `SEQUENCE:${event.sequence ?? 0}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    `URL:${event.url}`,
    `LOCATION:${escapeText(event.url)}`,
    event.organizer
      ? `ORGANIZER;CN=${escapeText(event.organizer.name)}:mailto:${event.organizer.email}`
      : null,
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter((line): line is string => line != null);

  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** Google's calendar "render?action=TEMPLATE" deep link — no API, no OAuth. */
export function googleCalendarUrl(
  event: Pick<CalendarEvent, "title" | "description" | "url" | "start" | "end">,
): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${toIcsUtc(event.start)}/${toIcsUtc(event.end)}`,
    details: event.description,
    location: event.url,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
