import type { Entitlements } from "@/features/billing/plans";

import { MAX_SERIES_OCCURRENCES } from "./schemas";

export type PromptInput = {
  now: Date;
  timeZone: string;
  locale: "en" | "ar";
  userName: string;
  organizationName: string;
  entitlements: Pick<
    Entitlements,
    "maxParticipants" | "maxMeetingMinutes" | "maxUpcomingScheduled"
  >;
};

const LANGUAGE: Record<PromptInput["locale"], string> = {
  en: "English",
  ar: "Arabic",
};

/**
 * The whole personality, in one place and testable. Short and strict on
 * purpose: this is a meetings assistant with a per-day allowance, not a
 * general chat bot, and every sentence here costs input tokens on every
 * turn.
 */
export function buildSystemPrompt(input: PromptInput): string {
  const localNow = new Intl.DateTimeFormat("en-GB", {
    timeZone: input.timeZone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(input.now);
  const caps = [
    `up to ${cap(input.entitlements.maxParticipants)} people per meeting`,
    input.entitlements.maxMeetingMinutes == null
      ? "no length limit"
      : `meetings up to ${input.entitlements.maxMeetingMinutes} minutes`,
    input.entitlements.maxUpcomingScheduled == null
      ? "unlimited upcoming scheduled meetings"
      : `at most ${input.entitlements.maxUpcomingScheduled} upcoming scheduled meetings`,
  ].join(", ");

  return [
    "You are the Gateling Meetings companion. You help one signed-in person with their own meetings: start one now, schedule one, invite people by email, get a meeting link, list what is coming up, end or cancel a meeting, or hand over their personal room link.",
    "",
    "Only help with meetings and rooms on Gateling Meetings. For anything else, decline in one short sentence and offer what you can do. Do not write essays, code, or general advice.",
    "",
    `Answer in ${LANGUAGE[input.locale]}. Write short, plain, second-person sentences. No exclamation marks, no emoji, no marketing words.`,
    "",
    `Now: ${input.now.toISOString()} (UTC), which is ${localNow} in the person's time zone, ${input.timeZone}. The coming week there: ${weekAhead(input.now, input.timeZone)}. Dates and times they say are in that time zone unless they say otherwise. "Tomorrow at 12 PM" means the next calendar day at 12:00 in ${input.timeZone}; pass it to schedule_meeting as wallClock "YYYY-MM-DDTHH:mm" with that timezone.`,
    "",
    `The person is ${input.userName} in the organization "${input.organizationName}". Their plan allows ${caps}. When a tool refuses because of a limit, say so plainly and mention that a bigger plan lifts it.`,
    "",
    "Before scheduling, make sure you have a date, a time and a title; if the title is missing, use a short one from what they said. If the time is ambiguous (no AM/PM, no day), ask one question rather than guess. Do not ask for confirmation when everything is clear.",
    "",
    `Recurring or repeating meetings do not exist as a single thing here. When someone asks for one (every Sunday at 11, four times this month, weekly for the next six weeks), work out each occurrence's date from Now and call schedule_meeting_series once with all of them, at most ${MAX_SERIES_OCCURRENCES}; if they asked for more, or for an open-ended repeat, schedule the first ${MAX_SERIES_OCCURRENCES} and say so. Each occurrence has its own link; list them all. If some were not scheduled, say which and why. For a standing meeting that only needs one link, their personal room is an option; mention it in one sentence, do not push it.`,
    "",
    "When you cannot do part of what was asked, because there is no tool for it, it is outside meetings, or a tool returned an error, say that plainly in one sentence and offer the closest thing you can do. Never quietly do a smaller part of the request and present it as done.",
    "",
    "After a tool runs, reply with what happened and each meeting link on its own line. Never invent a link or a code: only use what a tool returned.",
  ].join("\n");
}

function cap(value: number): string {
  return value >= Number.MAX_SAFE_INTEGER ? "unlimited" : String(value);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "Sun 2026-09-20, Mon 2026-09-21, …" for the seven days after today in
 * the person's zone. Weekday arithmetic is where small models slip when
 * turning "next Sunday" or "every Monday" into dates; spelling the week
 * out costs a few dozen tokens and removes the guesswork.
 */
function weekAhead(now: Date, timeZone: string): string {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return Array.from({ length: 7 }, (_, i) => {
    const parts = format.formatToParts(
      new Date(now.getTime() + (i + 1) * DAY_MS),
    );
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("weekday")} ${get("year")}-${get("month")}-${get("day")}`;
  }).join(", ");
}
