import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { MeetingsTable } from "@/drizzle/schema";
import { generateMeetingCode } from "@/features/meetings/lib/meeting-code";
import { getRoomService } from "@/integrations/livekit/client";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
  type TRPCContext,
} from "@/integrations/trpc/init";
import { findMeetingByCode } from "./queries";
import {
  createInstantMeetingSchema,
  meetingCodeSchema,
  updateMeetingSettingsSchema,
} from "./schemas";

/**
 * A unique index guards `code`; on the astronomically rare collision the
 * insert throws and we simply draw again rather than pre-checking (which
 * would race anyway).
 */
const CODE_RETRIES = 3;

export const meetingsRouter = createTRPCRouter({
  /**
   * "New meeting" — live immediately, the host is redirected straight into
   * the room. The title is optional; the dashboard shows a dated default.
   */
  createInstant: protectedProcedure
    .input(createInstantMeetingSchema)
    .mutation(async ({ ctx, input }) => {
      const title = input.title ?? ctx.t("meetings.instantTitle");

      for (let attempt = 0; attempt < CODE_RETRIES; attempt++) {
        const code = generateMeetingCode();
        try {
          const [meeting] = await ctx.db
            .insert(MeetingsTable)
            .values({
              hostId: ctx.session.user.id,
              code,
              title,
              status: "live",
              startedAt: new Date(),
              createdBy: ctx.session.user.id,
            })
            .returning({ code: MeetingsTable.code });
          if (meeting) return meeting;
        } catch (error) {
          if (attempt === CODE_RETRIES - 1) throw error;
        }
      }

      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
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

  /** Host-only. Everything the dashboard lists, newest first. */
  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db.query.MeetingsTable.findMany({
      where: eq(MeetingsTable.hostId, ctx.session.user.id),
      orderBy: [desc(MeetingsTable.createdAt)],
      limit: 50,
      columns: {
        id: true,
        code: true,
        title: true,
        status: true,
        scheduledAt: true,
        startedAt: true,
        endedAt: true,
        isPersonalRoom: true,
      },
    }),
  ),

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
   * `join.request` refuses an ended meeting.
   */
  end: protectedProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      if (meeting.status === "ended") return { status: "ended" as const };

      await ctx.db
        .update(MeetingsTable)
        .set({
          status: "ended",
          endedAt: new Date(),
          updatedBy: ctx.session.user.id,
        })
        .where(eq(MeetingsTable.id, meeting.id));

      // The room may never have been created (nobody connected) — LiveKit
      // returns 404 for that, which is the outcome we wanted anyway.
      try {
        await getRoomService().deleteRoom(meeting.code);
      } catch (error) {
        console.warn(`[livekit] deleteRoom(${meeting.code}) failed`, error);
      }

      return { status: "ended" as const };
    }),
});

type HostContext = Pick<TRPCContext, "db" | "t"> & {
  session: NonNullable<TRPCContext["session"]>;
};

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
