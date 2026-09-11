import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { DataPacket_Kind } from "livekit-server-sdk";
import { z } from "zod";

import type { DatabaseOrTransaction } from "@/drizzle";
import { BreakoutAssignmentsTable, BreakoutRoomsTable } from "@/drizzle/schema";
import { getRoomService } from "@/integrations/livekit/client";
import { moveParticipant } from "@/integrations/livekit/move";
import { verifyParticipantKey } from "@/integrations/livekit/participant-key";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/integrations/trpc/init";
import { requireHostedMeeting } from "./meetings-router";
import { meetingCodeSchema } from "./schemas";

export const BROADCAST_TOPIC = "broadcast";
const MAX_BREAKOUT_ROOMS = 20;

const codeInput = z.object({ code: meetingCodeSchema });
const roomInput = codeInput.extend({ roomId: z.uuid() });
const identityInput = codeInput.extend({
  identity: z.string().min(1).max(64),
});

/** `<code>:b3` — the LiveKit room behind breakout #3 of meeting `<code>`. */
export function breakoutRoomName(code: string, index: number) {
  return `${code}:b${index}`;
}

/** Room metadata lets a participant's client show the room's name without a query. */
export function breakoutMetadata(name: string, mainRoom: string) {
  return JSON.stringify({ breakout: name, main: mainRoom });
}

async function activeRooms(db: DatabaseOrTransaction, meetingId: string) {
  return db.query.BreakoutRoomsTable.findMany({
    where: and(
      eq(BreakoutRoomsTable.meetingId, meetingId),
      ne(BreakoutRoomsTable.status, "closed"),
    ),
    orderBy: [asc(BreakoutRoomsTable.index)],
    with: { assignments: true },
  });
}

/**
 * Where is this participant right now? LiveKit has no cross-room lookup,
 * so ask the main room and every open breakout in turn.
 */
async function findParticipantRoom(
  mainRoom: string,
  breakoutRoomNames: string[],
  identity: string,
): Promise<string | null> {
  const service = getRoomService();
  for (const roomName of [mainRoom, ...breakoutRoomNames]) {
    try {
      await service.getParticipant(roomName, identity);
      return roomName;
    } catch {
      // Not in this room (LiveKit answers 404) — keep looking.
    }
  }
  return null;
}

/** Best-effort move: a participant who has since left is not an error for the others. */
const moveIfPresent = moveParticipant;

export const breakoutsRouter = createTRPCRouter({
  list: protectedProcedure.input(codeInput).query(async ({ ctx, input }) => {
    const meeting = await requireHostedMeeting(ctx, input.code);
    return activeRooms(ctx.db, meeting.id);
  }),

  /** Adds `count` draft rooms after the existing ones. */
  create: protectedProcedure
    .input(
      codeInput.extend({
        count: z.number().int().min(1).max(MAX_BREAKOUT_ROOMS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const existing = await activeRooms(ctx.db, meeting.id);
      if (existing.length + input.count > MAX_BREAKOUT_ROOMS) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ctx.t("meetings.breakouts.errors.tooMany"),
        });
      }
      // Indices keep climbing across close/reopen so LiveKit room names never collide.
      const all = await ctx.db.query.BreakoutRoomsTable.findMany({
        where: eq(BreakoutRoomsTable.meetingId, meeting.id),
        columns: { index: true },
      });
      const start = Math.max(0, ...all.map((room) => room.index)) + 1;
      await ctx.db.insert(BreakoutRoomsTable).values(
        Array.from({ length: input.count }, (_, i) => {
          const index = start + i;
          return {
            meetingId: meeting.id,
            index,
            name: ctx.t("meetings.breakouts.defaultName", {
              n: existing.length + i + 1,
            }),
            liveKitRoomName: breakoutRoomName(meeting.code, index),
          };
        }),
      );
      return { ok: true };
    }),

  rename: protectedProcedure
    .input(roomInput.extend({ name: z.string().trim().min(1).max(64) }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await ctx.db
        .update(BreakoutRoomsTable)
        .set({ name: input.name })
        .where(
          and(
            eq(BreakoutRoomsTable.id, input.roomId),
            eq(BreakoutRoomsTable.meetingId, meeting.id),
          ),
        );
      return { ok: true };
    }),

  remove: protectedProcedure
    .input(roomInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      await ctx.db
        .delete(BreakoutRoomsTable)
        .where(
          and(
            eq(BreakoutRoomsTable.id, input.roomId),
            eq(BreakoutRoomsTable.meetingId, meeting.id),
            eq(BreakoutRoomsTable.status, "draft"),
          ),
        );
      return { ok: true };
    }),

  /** Puts one person in one room (moving them out of any other). Open rooms move them now. */
  assign: protectedProcedure
    .input(
      roomInput.extend({
        identity: z.string().min(1).max(64),
        displayName: z.string().max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const rooms = await activeRooms(ctx.db, meeting.id);
      const target = rooms.find((room) => room.id === input.roomId);
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db.transaction(async (trx) => {
        await trx.delete(BreakoutAssignmentsTable).where(
          and(
            inArray(
              BreakoutAssignmentsTable.breakoutRoomId,
              rooms.map((room) => room.id),
            ),
            eq(BreakoutAssignmentsTable.identity, input.identity),
          ),
        );
        await trx.insert(BreakoutAssignmentsTable).values({
          breakoutRoomId: target.id,
          identity: input.identity,
          displayName: input.displayName,
        });
      });

      if (target.status === "open") {
        const from = await findParticipantRoom(
          meeting.code,
          rooms.map((room) => room.liveKitRoomName),
          input.identity,
        );
        if (from && from !== target.liveKitRoomName) {
          await moveIfPresent(from, input.identity, target.liveKitRoomName);
        }
      }
      return { ok: true };
    }),

  unassign: protectedProcedure
    .input(identityInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const rooms = await activeRooms(ctx.db, meeting.id);
      await ctx.db.delete(BreakoutAssignmentsTable).where(
        and(
          inArray(
            BreakoutAssignmentsTable.breakoutRoomId,
            rooms.map((room) => room.id),
          ),
          eq(BreakoutAssignmentsTable.identity, input.identity),
        ),
      );
      return { ok: true };
    }),

  /** Round-robins everyone currently in the main room (except the host) across the rooms. */
  autoAssign: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const rooms = await activeRooms(ctx.db, meeting.id);
      if (rooms.length === 0) {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }

      const hostIdentity = `user:${ctx.session.user.id}`;
      const participants = (
        await getRoomService().listParticipants(meeting.code)
      ).filter((participant) => participant.identity !== hostIdentity);

      await ctx.db.transaction(async (trx) => {
        await trx.delete(BreakoutAssignmentsTable).where(
          inArray(
            BreakoutAssignmentsTable.breakoutRoomId,
            rooms.map((room) => room.id),
          ),
        );
        if (participants.length === 0) return;
        await trx.insert(BreakoutAssignmentsTable).values(
          participants.map((participant, i) => ({
            breakoutRoomId: (rooms[i % rooms.length] as (typeof rooms)[number])
              .id,
            identity: participant.identity,
            displayName: participant.name || participant.identity,
          })),
        );
      });
      return { assigned: participants.length };
    }),

  /** Creates the LiveKit rooms (with their names in metadata) and moves everyone assigned. */
  open: protectedProcedure.input(codeInput).mutation(async ({ ctx, input }) => {
    const meeting = await requireHostedMeeting(ctx, input.code);
    const rooms = await activeRooms(ctx.db, meeting.id);
    if (rooms.length === 0) {
      throw new TRPCError({ code: "PRECONDITION_FAILED" });
    }
    const service = getRoomService();

    let moved = 0;
    for (const room of rooms) {
      await service.createRoom({
        name: room.liveKitRoomName,
        metadata: breakoutMetadata(room.name, meeting.code),
        emptyTimeout: 60 * 60,
      });
      for (const assignment of room.assignments) {
        if (
          await moveIfPresent(
            meeting.code,
            assignment.identity,
            room.liveKitRoomName,
          )
        ) {
          moved++;
        }
      }
    }
    await ctx.db
      .update(BreakoutRoomsTable)
      .set({ status: "open", openedAt: new Date() })
      .where(
        inArray(
          BreakoutRoomsTable.id,
          rooms.map((room) => room.id),
        ),
      );
    return { moved };
  }),

  /** Brings everyone home and retires the rooms. */
  closeAll: protectedProcedure
    .input(codeInput)
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const rooms = await activeRooms(ctx.db, meeting.id);
      const service = getRoomService();

      for (const room of rooms.filter((room) => room.status === "open")) {
        let participants: Awaited<ReturnType<typeof service.listParticipants>> =
          [];
        try {
          participants = await service.listParticipants(room.liveKitRoomName);
        } catch {
          // Room already gone (empty timeout) — nobody to bring back.
        }
        await Promise.all(
          participants.map((participant) =>
            moveIfPresent(
              room.liveKitRoomName,
              participant.identity,
              meeting.code,
            ),
          ),
        );
        try {
          await service.deleteRoom(room.liveKitRoomName);
        } catch {
          // Already deleted.
        }
      }
      await ctx.db
        .update(BreakoutRoomsTable)
        .set({ status: "closed", closedAt: new Date() })
        .where(
          inArray(
            BreakoutRoomsTable.id,
            rooms.map((room) => room.id),
          ),
        );
      return { ok: true };
    }),

  /** The host drops in on a room (or back to main with `roomId: null`). */
  visit: protectedProcedure
    .input(codeInput.extend({ roomId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const rooms = await activeRooms(ctx.db, meeting.id);
      const target =
        input.roomId == null
          ? meeting.code
          : rooms.find(
              (room) => room.id === input.roomId && room.status === "open",
            )?.liveKitRoomName;
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      const hostIdentity = `user:${ctx.session.user.id}`;
      const from = await findParticipantRoom(
        meeting.code,
        rooms.map((room) => room.liveKitRoomName),
        hostIdentity,
      );
      if (!from) throw new TRPCError({ code: "PRECONDITION_FAILED" });
      if (from !== target) await moveIfPresent(from, hostIdentity, target);
      return { ok: true };
    }),

  /** A message from the host to every room at once (shown as a banner). */
  broadcast: protectedProcedure
    .input(codeInput.extend({ message: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const meeting = await requireHostedMeeting(ctx, input.code);
      const rooms = await activeRooms(ctx.db, meeting.id);
      const service = getRoomService();
      const payload = new TextEncoder().encode(input.message);
      const targets = [
        meeting.code,
        ...rooms
          .filter((room) => room.status === "open")
          .map((room) => room.liveKitRoomName),
      ];
      await Promise.all(
        targets.map((roomName) =>
          service
            .sendData(roomName, payload, DataPacket_Kind.RELIABLE, {
              topic: BROADCAST_TOPIC,
            })
            .catch(() => undefined),
        ),
      );
      return { ok: true };
    }),

  /**
   * Self-service "return to main room" for anyone, guest included. The
   * participant key from the join response is the proof of identity.
   */
  returnToMain: publicProcedure
    .input(identityInput.extend({ participantKey: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (!verifyParticipantKey(input.identity, input.participantKey)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const meeting = await ctx.db.query.MeetingsTable.findFirst({
        where: (table, { eq }) => eq(table.code, input.code),
        columns: { id: true, code: true },
      });
      if (!meeting) throw new TRPCError({ code: "NOT_FOUND" });
      const rooms = await activeRooms(ctx.db, meeting.id);
      const from = await findParticipantRoom(
        meeting.code,
        rooms.map((room) => room.liveKitRoomName),
        input.identity,
      );
      if (from && from !== meeting.code) {
        await moveIfPresent(from, input.identity, meeting.code);
      }
      return { ok: true };
    }),
});
