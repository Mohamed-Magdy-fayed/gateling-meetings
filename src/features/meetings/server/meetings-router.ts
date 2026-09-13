import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { MeetingsTable } from "@/drizzle/schema";
import { meetingEndsAt } from "@/features/billing/plans";
import { entitlementsForMeeting } from "@/features/billing/server/entitlements";
import {
  createTRPCRouter,
  orgProcedure,
  protectedProcedure,
  publicProcedure,
  type TRPCContext,
} from "@/integrations/trpc/init";
import { findMeetingByCode } from "./queries";
import {
  createInstantMeetingSchema,
  meetingCodeSchema,
  scheduledMeetingSchema,
  updateMeetingSchema,
  updateMeetingSettingsSchema,
} from "./schemas";
import {
  createInstantMeeting,
  createScheduledMeeting,
  deleteMeeting,
  endMeeting,
  insertWithFreshCode,
  updateMeeting,
  updateMeetingSettings,
} from "./service";

type HostContext = Pick<TRPCContext, "db" | "t"> & {
  session: NonNullable<TRPCContext["session"]>;
};

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
  createInstant: orgProcedure
    .input(createInstantMeetingSchema)
    .mutation(({ ctx, input }) =>
      createInstantMeeting(ctx, {
        hostId: ctx.session.user.id,
        organizationId: ctx.organization.id,
        entitlements: ctx.entitlements,
        title: input.title,
      }),
    ),

  /** A meeting for later: invitees get an email with an .ics and a reminder. */
  createScheduled: orgProcedure
    .input(scheduledMeetingSchema)
    .mutation(({ ctx, input }) =>
      createScheduledMeeting(ctx, {
        hostId: ctx.session.user.id,
        organizationId: ctx.organization.id,
        entitlements: ctx.entitlements,
        input,
      }),
    ),

  /**
   * The host's permanent room — one per account, same link forever. Created
   * lazily the first time it is asked for, in whichever org is active then;
   * it is looked up by host afterwards, so switching orgs keeps the link.
   */
  getPersonalRoom: orgProcedure.mutation(async ({ ctx }) => {
    const existing = await ctx.db.query.MeetingsTable.findFirst({
      where: and(
        eq(MeetingsTable.hostId, ctx.session.user.id),
        eq(MeetingsTable.isPersonalRoom, true),
        isNull(MeetingsTable.deletedAt),
      ),
      columns: { code: true, title: true },
    });
    if (existing) return existing;

    const created = await insertWithFreshCode(ctx.db, {
      title: ctx.t("meetings.personalRoomTitle", {
        name: ctx.session.user.name ?? "",
      }),
      status: "live",
      isPersonalRoom: true,
      hostId: ctx.session.user.id,
      organizationId: ctx.organization.id,
      createdBy: ctx.session.user.id,
    });
    return { code: created.code, title: null };
  }),

  update: protectedProcedure
    .input(updateMeetingSchema)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const { code, ...fields } = input;
      await updateMeeting(
        ctx,
        meeting,
        fields,
        ctx.session.user.id,
        // The meeting's own org, not the caller's active one.
        entitlementsForMeeting(meeting),
      );
      return { code };
    }),

  /** Soft delete; the link stops resolving and the reminder is cancelled. */
  delete: protectedProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await deleteMeeting(ctx, meeting, ctx.session.user.id);
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
      const entitlements = entitlementsForMeeting(meeting);
      const endsAt =
        meeting.status === "live" && meeting.startedAt
          ? meetingEndsAt(meeting.startedAt, entitlements)
          : null;

      return {
        code: meeting.code,
        title: meeting.title,
        status: meeting.status,
        /** When the plan will end the room, or null if it never will. */
        endsAt,
        /** What the room's plan allows — drives which host controls render. */
        features: { breakouts: entitlements.breakouts },
        hostName: meeting.host.name ?? meeting.host.email,
        /** LiveKit identity of the host — clients badge by this, never by attributes. */
        hostIdentity: `user:${meeting.hostId}`,
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

  /**
   * Host-only, scoped to the active org. Upcoming first (soonest at the
   * top), then recent (newest at the top).
   */
  listMine: orgProcedure.query(async ({ ctx }) => {
    const where = and(
      eq(MeetingsTable.hostId, ctx.session.user.id),
      eq(MeetingsTable.organizationId, ctx.organization.id),
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
      return updateMeetingSettings(
        ctx,
        meeting,
        input.settings,
        ctx.session.user.id,
      );
    }),

  /** "End meeting for all" — see `endMeeting` in service.ts. */
  end: protectedProcedure
    .input(z.object({ code: meetingCodeSchema }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      return endMeeting(ctx, meeting, ctx.session.user.id);
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
