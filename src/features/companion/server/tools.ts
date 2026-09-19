import "server-only";

import { toolDefinition } from "@tanstack/ai";
import { TRPCError } from "@trpc/server";

import type { Database } from "@/drizzle";
import type { Entitlements } from "@/features/billing/plans";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TFunction } from "@/features/core/i18n/lib";
import { wallClockToInstant } from "@/features/meetings/lib/schedule-time";
import {
  findMeetingByCode,
  listHostedMeetings,
} from "@/features/meetings/server/queries";
import {
  createInstantMeeting,
  createScheduledMeeting,
  deleteMeeting,
  endMeeting,
  ensurePersonalRoom,
} from "@/features/meetings/server/service";
import { companionSchemas, DEFAULT_DURATION_MINUTES } from "./schemas";

/** Who the companion acts as: the signed-in person, in their active org. */
export type CompanionActor = {
  db: Database;
  t: TFunction<typeof mainTranslations>;
  userId: string;
  userName: string;
  organizationId: string;
  entitlements: Entitlements;
  /** Absolute origin for links, e.g. `https://meetings.gateling.com`. */
  baseUrl: string;
};

/**
 * What the companion can do, each a thin call into the same meeting
 * service the dashboard uses, as the signed-in person. Every result that
 * points at a meeting carries its link so "give me the link" is one turn.
 * Errors from the service (plan caps, past dates, not yours) come back as
 * a plain `error` field the model can explain rather than a thrown
 * exception that would end the run.
 */
export function companionTools(actor: CompanionActor) {
  const { db, t } = actor;
  const link = (code: string) => `${actor.baseUrl}/m/${code}`;
  const owner = {
    hostId: actor.userId,
    organizationId: actor.organizationId,
    entitlements: actor.entitlements,
  };

  async function requireMine(code: string) {
    const meeting = await findMeetingByCode(db, code);
    if (!meeting || meeting.hostId !== actor.userId) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: t("meetings.errors.notFound"),
      });
    }
    return meeting;
  }

  const listMyMeetings = toolDefinition({
    name: "list_my_meetings",
    description:
      "The person's own meetings in this organization: upcoming, live and recently ended, each with its link.",
    inputSchema: companionSchemas.listMyMeetings,
  }).server(() =>
    guard(async () => {
      const lists = await listHostedMeetings(
        db,
        actor.userId,
        actor.organizationId,
      );
      const row = (m: (typeof lists.upcoming)[number]) => ({
        code: m.code,
        title: m.title,
        status: m.status,
        scheduledAt: m.scheduledAt?.toISOString() ?? null,
        timezone: m.timezone,
        durationMinutes: m.durationMinutes,
        link: link(m.code),
      });
      return {
        upcoming: lists.upcoming.map(row),
        live: lists.live.map(row),
        ended: lists.ended.map(row),
      };
    }),
  );

  const createInstant = toolDefinition({
    name: "create_instant_meeting",
    description:
      "Starts a meeting right now and returns its link. Use when the person wants a meeting immediately.",
    inputSchema: companionSchemas.createInstantMeeting,
  }).server(({ title }) =>
    guard(async () => {
      const meeting = await createInstantMeeting(
        { db, t },
        { ...owner, title },
      );
      return { code: meeting.code, link: link(meeting.code) };
    }),
  );

  const schedule = toolDefinition({
    name: "schedule_meeting",
    description:
      "Schedules a meeting for a later date and time, optionally inviting people by email, and returns its link.",
    inputSchema: companionSchemas.scheduleMeeting,
  }).server((input) =>
    guard(async () => {
      const scheduledAt = wallClockToInstant(input.wallClock, input.timezone);
      const invitees = input.invitees ?? [];
      const meeting = await createScheduledMeeting(
        { db, t },
        {
          ...owner,
          input: {
            title: input.title,
            scheduledAt,
            durationMinutes: input.durationMinutes ?? DEFAULT_DURATION_MINUTES,
            timezone: input.timezone,
            waitingRoom: true,
            invitees,
          },
        },
      );
      return {
        code: meeting.code,
        title: input.title,
        scheduledAt: scheduledAt.toISOString(),
        timezone: input.timezone,
        invited: invitees.length,
        link: link(meeting.code),
      };
    }),
  );

  const getLink = toolDefinition({
    name: "get_meeting_link",
    description: "The share link for one of the person's meetings, by code.",
    inputSchema: companionSchemas.meetingByCode,
  }).server(({ code }) =>
    guard(async () => {
      const meeting = await requireMine(code);
      return { code: meeting.code, title: meeting.title, link: link(code) };
    }),
  );

  const personalRoom = toolDefinition({
    name: "get_personal_room_link",
    description:
      "The person's permanent personal room link — the same link every time. Creates the room if they do not have one yet.",
    inputSchema: companionSchemas.none,
  }).server(() =>
    guard(async () => {
      const room = await ensurePersonalRoom(
        { db, t },
        {
          hostId: actor.userId,
          hostName: actor.userName,
          organizationId: actor.organizationId,
        },
      );
      return { code: room.code, link: link(room.code) };
    }),
  );

  const end = toolDefinition({
    name: "end_meeting",
    description:
      "Ends one of the person's live meetings for everyone in it, by code.",
    inputSchema: companionSchemas.meetingByCode,
  }).server(({ code }) =>
    guard(async () => {
      const meeting = await requireMine(code);
      const result = await endMeeting({ db, t }, meeting, actor.userId);
      return { code, status: result.status };
    }),
  );

  const cancel = toolDefinition({
    name: "cancel_meeting",
    description:
      "Cancels (deletes) one of the person's scheduled meetings, by code. The link stops working.",
    inputSchema: companionSchemas.meetingByCode,
  }).server(({ code }) =>
    guard(async () => {
      const meeting = await requireMine(code);
      await deleteMeeting({ db, t }, meeting, actor.userId);
      return { code, cancelled: true };
    }),
  );

  return [
    listMyMeetings,
    createInstant,
    schedule,
    getLink,
    personalRoom,
    end,
    cancel,
  ] as const;
}

/** Service errors become data the model can read back to the person. */
async function guard<T>(
  work: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof TRPCError) return { error: error.message };
    if (
      error instanceof Error &&
      error.message.startsWith("Not a wall-clock")
    ) {
      return { error: error.message };
    }
    console.error("[companion] tool failed", error);
    return { error: "Something went wrong. Try again." };
  }
}
