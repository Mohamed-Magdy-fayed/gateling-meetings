import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { DEFAULT_MEETING_SETTINGS, MeetingsTable } from "@/drizzle/schema";
import {
  generateSalt,
  hashPassword,
} from "@/features/core/auth/core/passwordHasher";
import { generateMeetingCode } from "@/features/meetings/lib/meeting-code";
import {
  meetingInvitesRequestedEvent,
  meetingScheduleChangedEvent,
  meetingScheduledEvent,
} from "@/integrations/inngest/functions/meeting-events";
import { sendEvents } from "@/integrations/inngest/send";
import { getRoomService } from "@/integrations/livekit/client";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  type TRPCContext,
} from "@/integrations/trpc/init";
import { createInvites } from "./invites";
import { findMeetingByCode } from "./queries";
import {
  createInstantMeetingSchema,
  meetingCodeSchema,
  scheduledMeetingSchema,
  updateMeetingSchema,
  updateMeetingSettingsSchema,
} from "./schemas";

/**
 * A unique index guards `code`; on the astronomically rare collision the
 * insert throws and we simply draw again rather than pre-checking (which
 * would race anyway).
 */
const CODE_RETRIES = 3;

type HostContext = Pick<TRPCContext, "db" | "t"> & {
  session: NonNullable<TRPCContext["session"]>;
};

type InsertValues = Omit<
  typeof MeetingsTable.$inferInsert,
  "code" | "hostId" | "createdBy"
>;

async function insertWithFreshCode(ctx: HostContext, values: InsertValues) {
  for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
    try {
      const [meeting] = await ctx.db
        .insert(MeetingsTable)
        .values({
          ...values,
          hostId: ctx.session.user.id,
          createdBy: ctx.session.user.id,
          code: generateMeetingCode(),
        })
        .returning({ id: MeetingsTable.id, code: MeetingsTable.code });
      if (meeting) return meeting;
    } catch (error) {
      if (attempt === CODE_RETRIES - 1) throw error;
    }
  }
  throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
}

async function hashPasscode(passcode: string | undefined) {
  if (!passcode) return { passcodeHash: null, passcodeSalt: null };
  const passcodeSalt = generateSalt();
  return {
    passcodeHash: await hashPassword(passcode, passcodeSalt),
    passcodeSalt,
  };
}

const hostColumns = {
  id: true,
  code: true,
  title: true,
  status: true,
  scheduledAt: true,
  durationMinutes: true,
  timezone: true,
  startedAt: true,
  endedAt: true,
  isPersonalRoom: true,
  settings: true,
} as const;

export const meetingsRouter = createTRPCRouter({
  /**
   * "New meeting" — live immediately, the host is redirected straight into
   * the room. The title is optional; the dashboard shows a dated default.
   */
  createInstant: protectedProcedure
    .input(createInstantMeetingSchema)
    .mutation(({ ctx, input }) =>
      insertWithFreshCode(ctx, {
        title: input.title ?? ctx.t("meetings.instantTitle"),
        status: "live",
        startedAt: new Date(),
      }),
    ),

  /** A meeting for later: invitees get an email with an .ics and a reminder. */
  createScheduled: protectedProcedure
    .input(scheduledMeetingSchema)
    .mutation(async ({ ctx, input }) => {
      if (input.scheduledAt.getTime() < Date.now()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ctx.t("meetings.validation.pastDate"),
        });
      }
      const meeting = await insertWithFreshCode(ctx, {
        title: input.title,
        status: "scheduled",
        scheduledAt: input.scheduledAt,
        durationMinutes: input.durationMinutes,
        timezone: input.timezone,
        settings: {
          ...DEFAULT_MEETING_SETTINGS,
          waitingRoom: input.waitingRoom,
        },
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
    }),

  /**
   * The host's permanent room — one per account, same link forever. Created
   * lazily the first time it is asked for.
   */
  getPersonalRoom: protectedProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.query.MeetingsTable.findFirst({
      where: and(
        eq(MeetingsTable.hostId, ctx.session.user.id),
        eq(MeetingsTable.isPersonalRoom, true),
        isNull(MeetingsTable.deletedAt),
      ),
      columns: { code: true, title: true },
    });
    if (existing) return existing;

    const created = await insertWithFreshCode(ctx, {
      title: ctx.t("meetings.personalRoomTitle", {
        name: ctx.session.user.name ?? "",
      }),
      status: "live",
      isPersonalRoom: true,
    });
    return { code: created.code, title: null };
  }),

  update: protectedProcedure
    .input(updateMeetingSchema)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const { code, passcode, waitingRoom, ...fields } = input;
      const rescheduled =
        fields.scheduledAt != null &&
        fields.scheduledAt.getTime() !== meeting.scheduledAt?.getTime();

      await ctx.db
        .update(MeetingsTable)
        .set({
          ...fields,
          ...(passcode !== undefined ? await hashPasscode(passcode) : {}),
          ...(waitingRoom !== undefined
            ? { settings: { ...meeting.settings, waitingRoom } }
            : {}),
          updatedBy: ctx.session.user.id,
        })
        .where(eq(MeetingsTable.id, meeting.id));

      if (rescheduled && fields.scheduledAt) {
        // Cancels the sleeping reminder for the old time and arms a new one.
        await sendEvents([
          meetingScheduleChangedEvent.create({ meetingId: meeting.id }),
          meetingScheduledEvent.create({
            meetingId: meeting.id,
            scheduledAt: fields.scheduledAt.toISOString(),
          }),
        ]);
      }
      return { code };
    }),

  /** Soft delete; the link stops resolving and the reminder is cancelled. */
  delete: protectedProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await ctx.db
        .update(MeetingsTable)
        .set({ deletedAt: new Date(), deletedBy: ctx.session.user.id })
        .where(eq(MeetingsTable.id, meeting.id));
      await sendEvents(
        meetingScheduleChangedEvent.create({ meetingId: meeting.id }),
      );
      return { ok: true };
    }),

  /**
   * What the pre-join screen needs before anyone has committed to joining:
   * enough to render the title and decide which fields to ask for. Never the
   * token, never the passcode, never the settings a guest shouldn't see.
   */
  getByCode: publicProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .query(async ({ ctx, input }) => {
      const meeting = await findMeetingByCode(ctx.db, input.code);
      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("meetings.errors.notFound"),
        });
      }

      const isHost = ctx.session?.user.id === meeting.hostId;

      return {
        code: meeting.code,
        title: meeting.title,
        status: meeting.status,
        hostName: meeting.host.name ?? meeting.host.email,
        scheduledAt: meeting.scheduledAt,
        requiresPasscode: meeting.passcodeHash != null && !isHost,
        allowGuests: meeting.settings.allowGuests,
        isHost,
        // Only the host gets the full settings — they render the host panel.
        settings: isHost ? meeting.settings : null,
      };
    }),

  /** Host-only detail page: everything about one meeting, invites included. */
  getForHost: protectedProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .query(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const invites = await ctx.db.query.MeetingInvitesTable.findMany({
        where: (table, { eq }) => eq(table.meetingId, meeting.id),
        orderBy: (table, { asc }) => [asc(table.createdAt)],
        columns: { id: true, email: true, name: true, sentAt: true },
      });
      const { passcodeHash, passcodeSalt, ...rest } = meeting;
      return { ...rest, hasPasscode: passcodeHash != null, invites };
    }),

  /** Host-only. Upcoming first (soonest at the top), then recent (newest at the top). */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const where = and(
      eq(MeetingsTable.hostId, ctx.session.user.id),
      isNull(MeetingsTable.deletedAt),
      eq(MeetingsTable.isPersonalRoom, false),
    );
    const [upcoming, recent] = await Promise.all([
      ctx.db.query.MeetingsTable.findMany({
        where: and(where, eq(MeetingsTable.status, "scheduled")),
        orderBy: [asc(MeetingsTable.scheduledAt)],
        limit: 50,
        columns: hostColumns,
      }),
      ctx.db.query.MeetingsTable.findMany({
        where: and(where, eq(MeetingsTable.status, "live")),
        orderBy: [desc(MeetingsTable.startedAt)],
        limit: 20,
        columns: hostColumns,
      }),
    ]);
    const ended = await ctx.db.query.MeetingsTable.findMany({
      where: and(where, eq(MeetingsTable.status, "ended")),
      orderBy: [desc(MeetingsTable.endedAt)],
      limit: 20,
      columns: hostColumns,
    });
    return { upcoming, live: recent, ended };
  }),

  updateSettings: protectedProcedure
    .input(updateMeetingSettingsSchema)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const settings = { ...meeting.settings, ...input.settings };
      await ctx.db
        .update(MeetingsTable)
        .set({ settings, updatedBy: ctx.session.user.id })
        .where(eq(MeetingsTable.id, meeting.id));
      return settings;
    }),

  /**
   * "End meeting for all". Deleting the LiveKit room disconnects every
   * participant at the SFU — there is no client-side path back in, because
   * `join.request` refuses an ended meeting. A personal room is never
   * "ended": the link is permanent, so only the current session is cleared.
   */
  end: protectedProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      if (meeting.status === "ended") return { status: "ended" as const };

      if (!meeting.isPersonalRoom) {
        await ctx.db
          .update(MeetingsTable)
          .set({
            status: "ended",
            endedAt: new Date(),
            updatedBy: ctx.session.user.id,
          })
          .where(eq(MeetingsTable.id, meeting.id));
      }

      // The room may never have been created (nobody connected) — LiveKit
      // returns 404 for that, which is the outcome we wanted anyway.
      try {
        await getRoomService().deleteRoom(meeting.code);
      } catch (error) {
        console.warn(`[livekit] deleteRoom(${meeting.code}) failed`, error);
      }

      return {
        status: meeting.isPersonalRoom ? ("live" as const) : ("ended" as const),
      };
    }),
});

/** Loads a meeting and proves the caller hosts it — every host-only mutation starts here. */
export async function requireHostedMeeting(ctx: HostContext, code: string) {
  const meeting = await findMeetingByCode(ctx.db, code);
  if (!meeting) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: ctx.t("meetings.errors.notFound"),
    });
  }
  if (meeting.hostId !== ctx.session.user.id) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.t("errors.unauthorized"),
    });
  }
  return meeting;
}
