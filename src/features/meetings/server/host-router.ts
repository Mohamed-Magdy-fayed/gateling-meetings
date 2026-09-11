import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt } from "drizzle-orm";
import { TrackSource } from "livekit-server-sdk";
import { z } from "zod";

import { JoinRequestsTable } from "@/drizzle/schema";
import { PARTICIPANT_ATTRIBUTE_HAND_RAISED } from "@/integrations/livekit/attributes";
import { getRoomService } from "@/integrations/livekit/client";
import { createTRPCRouter, protectedProcedure } from "@/integrations/trpc/init";
import { requireHostedMeeting } from "./meetings-router";
import { meetingCodeSchema } from "./schemas";

/**
 * A waiting browser polls every ~2s; a request not seen for this long has
 * been abandoned (tab closed, network gone) and leaves the host's queue.
 */
const WAITING_HEARTBEAT_TTL_MS = 12_000;

const codeInput = z.object({ code: meetingCodeSchema });
const requestInput = codeInput.extend({ requestId: z.uuid() });
const participantInput = codeInput.extend({
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
  muteParticipant: protectedProcedure
    .input(participantInput)
    .mutation(async ({ ctx, input }) => {
      await requireHostedMeeting(ctx, input.code);
      await muteMicrophone(input.code, input.identity);
      return { ok: true };
    }),

  muteAll: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const participants = await getRoomService().listParticipants(
        meeting.code,
      );
      const hostIdentity = `user:${ctx.session.user.id}`;
      await Promise.all(
        participants
          .filter((participant) => participant.identity !== hostIdentity)
          .map((participant) =>
            muteMicrophone(meeting.code, participant.identity),
          ),
      );
      return { ok: true };
    }),

  removeParticipant: protectedProcedure
    .input(participantInput)
    .mutation(async ({ ctx, input }) => {
      await requireHostedMeeting(ctx, input.code);
      if (input.identity === `user:${ctx.session.user.id}`) {
        throw new TRPCError({ code: "BAD_REQUEST" });
      }
      await getRoomService().removeParticipant(input.code, input.identity);
      return { ok: true };
    }),

  lowerHand: protectedProcedure
    .input(participantInput)
    .mutation(async ({ ctx, input }) => {
      await requireHostedMeeting(ctx, input.code);
      await getRoomService().updateParticipant(input.code, input.identity, {
        attributes: { [PARTICIPANT_ATTRIBUTE_HAND_RAISED]: "" },
      });
      return { ok: true };
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

async function muteMicrophone(roomName: string, identity: string) {
  const service = getRoomService();
  const participant = await service.getParticipant(roomName, identity);
  await Promise.all(
    participant.tracks
      .filter(
        (track) => track.source === TrackSource.MICROPHONE && !track.muted,
      )
      .map((track) =>
        service.mutePublishedTrack(roomName, identity, track.sid, true),
      ),
  );
}
