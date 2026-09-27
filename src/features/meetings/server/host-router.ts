import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import { JoinRequestsTable, meetingSettingsSchema } from "@/drizzle/schema";
import { PARTICIPANT_ATTRIBUTE_HAND_RAISED } from "@/integrations/livekit/attributes";
import { getRoomService } from "@/integrations/livekit/client";
import { createTRPCRouter, protectedProcedure } from "@/integrations/trpc/init";
import { activeRooms } from "./breakouts-router";
import {
  HostActionError,
  isSelfTarget,
  type MutableSource,
  mapParticipantNotFound,
  muteSource,
  publishAllowAnnotations,
  resolveTargetRoom,
} from "./host-actions";
import { requireHostedMeeting } from "./meetings-router";
import { meetingCodeSchema } from "./schemas";

/**
 * A waiting browser polls every ~2s; a request not seen for this long has
 * been abandoned (tab closed, network gone) and leaves the host's queue.
 */
const WAITING_HEARTBEAT_TTL_MS = 12_000;

const codeInput = z.object({ code: meetingCodeSchema });
const requestInput = codeInput.extend({ requestId: z.uuid() });
const roomInput = codeInput.extend({
  roomName: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("Omitted means the main meeting room."),
});
const participantInput = roomInput.extend({
  identity: z.string().min(1).max(64),
});

/**
 * Everything a host does *to* other people. Every procedure re-proves that
 * the caller hosts the meeting — the LiveKit `roomAdmin` grant is what lets
 * the server act on the room, and this is what decides who gets to ask.
 */
export const hostRouter = createTRPCRouter({
  listWaiting: protectedProcedure
    .input(codeInput)
    .query(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      return ctx.db.query.JoinRequestsTable.findMany({
        where: and(
          eq(JoinRequestsTable.meetingId, meeting.id),
          eq(JoinRequestsTable.status, "pending"),
          gt(
            JoinRequestsTable.lastSeenAt,
            new Date(Date.now() - WAITING_HEARTBEAT_TTL_MS),
          ),
        ),
        orderBy: [desc(JoinRequestsTable.createdAt)],
        columns: { id: true, displayName: true, userId: true, createdAt: true },
      });
    }),

  admit: protectedProcedure
    .input(requestInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await resolveRequest(ctx.db, meeting.id, input.requestId, "admitted");
      return { ok: true };
    }),

  deny: protectedProcedure
    .input(requestInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await resolveRequest(ctx.db, meeting.id, input.requestId, "denied");
      return { ok: true };
    }),

  admitAll: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await ctx.db
        .update(JoinRequestsTable)
        .set({ status: "admitted", resolvedAt: new Date() })
        .where(
          and(
            eq(JoinRequestsTable.meetingId, meeting.id),
            eq(JoinRequestsTable.status, "pending"),
          ),
        );
      return { ok: true };
    }),

  /** Mutes the microphone at the SFU. The person can unmute themself again. */
  muteMicrophone: protectedProcedure
    .input(participantInput)
    .mutation(({ ctx, input }) =>
      muteParticipantSource(ctx, input, "microphone"),
    ),

  /**
   * @deprecated Use `muteMicrophone`. Kept so a browser still running the
   * previous deploy keeps working during rollout (see TODOS.md).
   */
  muteParticipant: protectedProcedure
    .input(participantInput)
    .mutation(({ ctx, input }) =>
      muteParticipantSource(ctx, input, "microphone"),
    ),

  /** Turns the camera off at the SFU. The person can turn it on themself again. */
  muteCamera: protectedProcedure
    .input(participantInput)
    .mutation(({ ctx, input }) => muteParticipantSource(ctx, input, "camera")),

  /** Mutes everyone but the host in one room; partial failures are counted, not thrown. */
  muteAll: protectedProcedure
    .input(roomInput)
    .mutation(async ({ ctx, input }) => {
      const { roomName } = await hostedRoom(ctx, input);
      const service = getRoomService();
      const participants = await service.listParticipants(roomName);
      const results = await Promise.allSettled(
        participants
          .filter(
            (participant) =>
              !isSelfTarget(participant.identity, ctx.session.user.id),
          )
          .map((participant) =>
            muteSource(service, roomName, participant.identity, "microphone"),
          ),
      );
      return {
        muted: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    }),

  removeParticipant: protectedProcedure
    .input(participantInput)
    .mutation(async ({ ctx, input }) => {
      const { roomName } = await hostedRoom(ctx, input, input.identity);
      await onParticipant(() =>
        getRoomService().removeParticipant(roomName, input.identity),
      );
      return { ok: true };
    }),

  lowerHand: protectedProcedure
    .input(participantInput)
    .mutation(async ({ ctx, input }) => {
      const { roomName } = await hostedRoom(ctx, input);
      await onParticipant(() =>
        getRoomService().updateParticipant(roomName, input.identity, {
          attributes: { [PARTICIPANT_ATTRIBUTE_HAND_RAISED]: "" },
        }),
      );
      return { ok: true };
    }),

  /**
   * Called once by the host's browser when it connects: copies the live
   * meeting settings into the main room's metadata, covering a room that
   * did not exist yet when the setting was last changed.
   */
  syncRoomState: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const { allowAnnotations } = meetingSettingsSchema.parse(
        meeting.settings,
      );
      const liveSync = await publishAllowAnnotations(
        getRoomService(),
        meeting.code,
        [],
        allowAnnotations,
      );
      return { liveSync };
    }),
});

async function resolveRequest(
  db: Parameters<typeof requireHostedMeeting>[0]["db"],
  meetingId: string,
  requestId: string,
  status: "admitted" | "denied",
) {
  const [updated] = await db
    .update(JoinRequestsTable)
    .set({ status, resolvedAt: new Date() })
    .where(
      and(
        eq(JoinRequestsTable.id, requestId),
        eq(JoinRequestsTable.meetingId, meetingId),
        eq(JoinRequestsTable.status, "pending"),
      ),
    )
    .returning({ id: JoinRequestsTable.id });
  if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
}

type HostContext = Parameters<typeof requireHostedMeeting>[0];

/**
 * Proves the caller hosts the meeting, then resolves which LiveKit room to
 * act in. With `target`, refuses the caller's own identity. Every refusal
 * happens before any LiveKit call.
 */
async function hostedRoom(
  ctx: HostContext,
  input: { code: string; roomName?: string },
  target?: string,
) {
  const meeting = await requireHostedMeeting(ctx, input.code);
  if (target != null && isSelfTarget(target, ctx.session.user.id)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      cause: new HostActionError("SELF_TARGET"),
    });
  }
  const openBreakouts =
    input.roomName == null || input.roomName === meeting.code
      ? []
      : (await activeRooms(ctx.db, meeting.id))
          .filter((room) => room.status === "open")
          .map((room) => room.liveKitRoomName);
  try {
    return {
      meeting,
      roomName: resolveTargetRoom(meeting.code, input.roomName, openBreakouts),
    };
  } catch (error) {
    throw new TRPCError({ code: "BAD_REQUEST", cause: error });
  }
}

async function muteParticipantSource(
  ctx: HostContext,
  input: { code: string; roomName?: string; identity: string },
  source: MutableSource,
) {
  const { roomName } = await hostedRoom(ctx, input, input.identity);
  return onParticipant(() =>
    muteSource(getRoomService(), roomName, input.identity, source),
  );
}

/** LiveKit not-found leaves as NOT_FOUND carrying `PARTICIPANT_NOT_FOUND`. */
async function onParticipant<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await mapParticipantNotFound(work);
  } catch (error) {
    if (error instanceof HostActionError) {
      throw new TRPCError({ code: "NOT_FOUND", cause: error });
    }
    throw error;
  }
}
