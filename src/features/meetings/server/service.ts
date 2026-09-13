import { TRPCError } from "@trpc/server";
import { eq, sql } from "drizzle-orm";
import type { z } from "zod";

import type { DatabaseOrTransaction } from "@/drizzle";
import {
  DEFAULT_MEETING_SETTINGS,
  type Meeting,
  type MeetingSettings,
  MeetingsTable,
  meetingSettingsSchema,
} from "@/drizzle/schema";
import { assertEntitlement, type Entitlements } from "@/features/billing/plans";
import { countUpcomingScheduled } from "@/features/billing/server/usage";
import {
  generateSalt,
  hashPassword,
} from "@/features/core/auth/core/passwordHasher";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TFunction } from "@/features/core/i18n/lib";
import { enqueueWebhook } from "@/features/integrations/server/webhooks";
import { generateMeetingCode } from "@/features/meetings/lib/meeting-code";
import {
  meetingEndedEvent,
  meetingInvitesRequestedEvent,
  meetingScheduleChangedEvent,
  meetingScheduledEvent,
} from "@/integrations/inngest/functions/meeting-events";
import { sendEvents } from "@/integrations/inngest/send";
import { getRoomService } from "@/integrations/livekit/client";
import { createInvites } from "./invites";
import type { scheduledMeetingSchema, updateMeetingSchema } from "./schemas";

/**
 * The meeting lifecycle, independent of who is asking. The tRPC router
 * (a signed-in host in a browser) and the REST API (another Gateling system
 * with an API key) both call these, so a rule added here — a passcode
 * hashed, a reminder re-armed, a webhook emitted — holds for both doors.
 *
 * Errors are `TRPCError`s: the router rethrows them as is and the REST
 * wrapper maps the code to an HTTP status, so one vocabulary serves both.
 */
export type MeetingServiceContext = {
  db: DatabaseOrTransaction;
  t: TFunction<typeof mainTranslations>;
};

/**
 * A unique index guards `code`; on the astronomically rare collision the
 * insert throws and we simply draw again rather than pre-checking (which
 * would race anyway).
 */
const CODE_RETRIES = 3;

type InsertValues = Omit<typeof MeetingsTable.$inferInsert, "code">;

export async function insertWithFreshCode(
  db: DatabaseOrTransaction,
  values: InsertValues,
) {
  for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
    try {
      const [meeting] = await db
        .insert(MeetingsTable)
        .values({ ...values, code: generateMeetingCode() })
        .returning({ id: MeetingsTable.id, code: MeetingsTable.code });
      if (meeting) return meeting;
    } catch (error) {
      if (attempt === CODE_RETRIES - 1) throw error;
    }
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
}

export async function hashPasscode(passcode: string | undefined) {
  if (!passcode) return { passcodeHash: null, passcodeSalt: null };
  const passcodeSalt = generateSalt();
  return {
    passcodeHash: await hashPassword(passcode, passcodeSalt),
    passcodeSalt,
  };
}

/** Where a meeting came from, when it came from another system. */
export type MeetingOrigin = {
  integrationId: string;
  externalRef?: string | null;
};

/**
 * Who owns the meeting and what they may do. Passed in rather than looked
 * up here because the two doors resolve it differently: the tRPC router
 * from the session's active org, the REST API from the integration's org.
 */
export type MeetingOwner = {
  hostId: string;
  organizationId: string;
  entitlements: Entitlements;
};

type CreateInstantInput = MeetingOwner & {
  title?: string;
  origin?: MeetingOrigin;
  settings?: Partial<MeetingSettings>;
};

/** "New meeting" — live immediately; the host goes straight into the room. */
export function createInstantMeeting(
  ctx: MeetingServiceContext,
  { hostId, organizationId, title, origin, settings }: CreateInstantInput,
) {
  return insertWithFreshCode(ctx.db, {
    title: title ?? ctx.t("meetings.instantTitle"),
    status: "live",
    startedAt: new Date(),
    hostId,
    organizationId,
    createdBy: hostId,
    settings: { ...DEFAULT_MEETING_SETTINGS, ...settings },
    integrationId: origin?.integrationId,
    externalRef: origin?.externalRef ?? null,
  });
}

export type ScheduledMeetingInput = z.infer<typeof scheduledMeetingSchema>;

type CreateScheduledInput = MeetingOwner & {
  input: ScheduledMeetingInput;
  origin?: MeetingOrigin;
  settings?: Partial<MeetingSettings>;
};

/** A meeting for later: invitees get an email with an .ics and a reminder. */
export async function createScheduledMeeting(
  ctx: MeetingServiceContext,
  {
    hostId,
    organizationId,
    entitlements,
    input,
    origin,
    settings,
  }: CreateScheduledInput,
) {
  if (input.scheduledAt.getTime() < Date.now()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: ctx.t("meetings.validation.pastDate"),
    });
  }
  assertEntitlement(
    ctx.t,
    entitlements,
    "maxMeetingMinutes",
    input.durationMinutes,
  );
  if (entitlements.maxUpcomingScheduled != null) {
    assertEntitlement(
      ctx.t,
      entitlements,
      "maxUpcomingScheduled",
      await countUpcomingScheduled(ctx.db, organizationId),
    );
  }
  const meeting = await insertWithFreshCode(ctx.db, {
    title: input.title,
    status: "scheduled",
    scheduledAt: input.scheduledAt,
    durationMinutes: input.durationMinutes,
    timezone: input.timezone,
    hostId,
    organizationId,
    createdBy: hostId,
    settings: {
      ...DEFAULT_MEETING_SETTINGS,
      ...settings,
      waitingRoom: input.waitingRoom,
    },
    integrationId: origin?.integrationId,
    externalRef: origin?.externalRef ?? null,
    ...(await hashPasscode(input.passcode)),
  });

  const invites = await createInvites(ctx.db, meeting.id, input.invitees);
  await sendEvents([
    meetingScheduledEvent.create({
      meetingId: meeting.id,
      scheduledAt: input.scheduledAt.toISOString(),
    }),
    ...(invites.length > 0
      ? [
          meetingInvitesRequestedEvent.create({
            meetingId: meeting.id,
            inviteIds: invites.map((invite) => invite.id),
          }),
        ]
      : []),
  ]);

  return meeting;
}

export type UpdateMeetingInput = Omit<
  z.infer<typeof updateMeetingSchema>,
  "code"
>;

/**
 * Title, time, passcode, waiting room. A changed start time cancels the
 * sleeping reminder for the old time and arms a new one.
 */
export async function updateMeeting(
  ctx: MeetingServiceContext,
  meeting: Meeting,
  input: UpdateMeetingInput,
  actorId: string,
  entitlements: Entitlements,
) {
  const { passcode, waitingRoom, ...fields } = input;
  const rescheduled =
    fields.scheduledAt != null &&
    fields.scheduledAt.getTime() !== meeting.scheduledAt?.getTime();
  if (
    rescheduled &&
    fields.scheduledAt &&
    fields.scheduledAt.getTime() < Date.now()
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: ctx.t("meetings.validation.pastDate"),
    });
  }
  if (fields.durationMinutes != null) {
    assertEntitlement(
      ctx.t,
      entitlements,
      "maxMeetingMinutes",
      fields.durationMinutes,
    );
  }

  await ctx.db
    .update(MeetingsTable)
    .set({
      ...fields,
      ...(passcode !== undefined ? await hashPasscode(passcode) : {}),
      ...(waitingRoom !== undefined
        ? { settings: { ...meeting.settings, waitingRoom } }
        : {}),
      updatedBy: actorId,
    })
    .where(eq(MeetingsTable.id, meeting.id));

  if (rescheduled && fields.scheduledAt) {
    await sendEvents([
      meetingScheduleChangedEvent.create({ meetingId: meeting.id }),
      meetingScheduledEvent.create({
        meetingId: meeting.id,
        scheduledAt: fields.scheduledAt.toISOString(),
      }),
    ]);
  }
}

/**
 * Merged in SQL (`||`) so two switches flipped in quick succession each
 * write only their own key instead of the last read winning.
 */
export async function updateMeetingSettings(
  ctx: MeetingServiceContext,
  meeting: Meeting,
  settings: Partial<MeetingSettings>,
  actorId: string,
) {
  const [updated] = await ctx.db
    .update(MeetingsTable)
    .set({
      settings: sql`${MeetingsTable.settings} || ${JSON.stringify(settings)}::jsonb`,
      updatedBy: actorId,
    })
    .where(eq(MeetingsTable.id, meeting.id))
    .returning({ settings: MeetingsTable.settings });
  return meetingSettingsSchema.parse(updated?.settings ?? meeting.settings);
}

/** Soft delete; the link stops resolving and the reminder is cancelled. */
export async function deleteMeeting(
  ctx: MeetingServiceContext,
  meeting: Meeting,
  actorId: string,
) {
  await ctx.db
    .update(MeetingsTable)
    .set({ deletedAt: new Date(), deletedBy: actorId })
    .where(eq(MeetingsTable.id, meeting.id));
  await sendEvents(
    meetingScheduleChangedEvent.create({ meetingId: meeting.id }),
  );
}

/**
 * "End meeting for all". Deleting the LiveKit room disconnects every
 * participant at the SFU — there is no client-side path back in, because
 * `join.request` refuses an ended meeting. A personal room is never
 * "ended": the link is permanent, so only the current session is cleared.
 */
export async function endMeeting(
  ctx: MeetingServiceContext,
  meeting: Meeting,
  actorId: string,
) {
  if (meeting.status === "ended") return { status: "ended" as const };

  const endedAt = new Date();
  if (!meeting.isPersonalRoom) {
    await ctx.db
      .update(MeetingsTable)
      .set({ status: "ended", endedAt, updatedBy: actorId })
      .where(eq(MeetingsTable.id, meeting.id));
  }

  // The room may never have been created (nobody connected) — LiveKit
  // returns 404 for that, which is the outcome we wanted anyway.
  try {
    await getRoomService().deleteRoom(meeting.code);
  } catch (error) {
    console.warn(`[livekit] deleteRoom(${meeting.code}) failed`, error);
  }

  // Disarms the duration enforcer. Sent for personal rooms too: their
  // status never flips, so this is the only signal the timer gets.
  await sendEvents(meetingEndedEvent.create({ meetingId: meeting.id }));

  // The status flipped above, so the later `room_finished` webhook from
  // LiveKit sees "already ended" and does not emit a second one.
  if (!meeting.isPersonalRoom && meeting.integrationId) {
    await enqueueWebhook(ctx.db, {
      integrationId: meeting.integrationId,
      event: "meeting.ended",
      data: {
        meeting: toWebhookMeeting({ ...meeting, status: "ended", endedAt }),
        endedBy: actorId.startsWith("integration:")
          ? "integration"
          : actorId.startsWith("system:")
            ? "system"
            : "host",
      },
    });
  }

  return {
    status: meeting.isPersonalRoom ? ("live" as const) : ("ended" as const),
  };
}

/** The meeting fields other systems see — never the passcode hash. */
export function toWebhookMeeting(
  meeting: Pick<
    Meeting,
    | "id"
    | "code"
    | "title"
    | "status"
    | "externalRef"
    | "scheduledAt"
    | "startedAt"
    | "endedAt"
  >,
) {
  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    status: meeting.status,
    externalRef: meeting.externalRef,
    scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    endedAt: meeting.endedAt?.toISOString() ?? null,
  };
}
