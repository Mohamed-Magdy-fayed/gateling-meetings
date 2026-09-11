import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  JoinRequestsTable,
  type Meeting,
  MeetingInvitesTable,
} from "@/drizzle/schema";
import { comparePasswords } from "@/features/core/auth/core/passwordHasher";
import { getLiveKitConfig } from "@/integrations/livekit/client";
import { signParticipantIdentity } from "@/integrations/livekit/participant-key";
import {
  createMeetingToken,
  type MeetingRole,
} from "@/integrations/livekit/token";
import {
  getRequestIp,
  isRateLimited,
  meetingCodeRatelimit,
  meetingJoinRatelimit,
} from "@/integrations/ratelimit";
import {
  createTRPCRouter,
  publicProcedure,
  type TRPCContext,
} from "@/integrations/trpc/init";
import { findMeetingByCode } from "./queries";
import { joinRequestSchema } from "./schemas";

/**
 * LiveKit identities must be unique per room; a second connection with the
 * same identity bumps the first. Hosts are stable (`user:<id>`) so a host
 * who reopens the tab replaces their stale session rather than appearing
 * twice. Guests get a fresh id per join — the client keeps it for rejoins.
 */
function hostIdentity(userId: string) {
  return `user:${userId}`;
}
function guestIdentity() {
  return `guest:${crypto.randomBytes(6).toString("hex")}`;
}

type AdmittedSession = {
  status: "admitted";
  token: string;
  serverUrl: string;
  identity: string;
  role: MeetingRole;
  muteOnEntry: boolean;
  /** Proves identity on later self-service requests (see participant-key.ts). */
  participantKey: string;
};

async function admit(
  meeting: Meeting,
  identity: string,
  displayName: string,
  role: MeetingRole,
): Promise<AdmittedSession> {
  const token = await createMeetingToken({
    roomName: meeting.code,
    identity,
    name: displayName,
    role,
    canShareScreen: role === "host" || meeting.settings.allowScreenShare,
  });
  return {
    status: "admitted",
    token,
    serverUrl: getLiveKitConfig().url,
    identity,
    role,
    muteOnEntry: role !== "host" && meeting.settings.muteOnEntry,
    participantKey: signParticipantIdentity(identity),
  };
}

function assertJoinable(
  ctx: Pick<TRPCContext, "t">,
  meeting: Meeting,
  role: MeetingRole,
  userId: string | null,
) {
  if (meeting.status === "ended") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ctx.t("meetings.errors.ended"),
    });
  }
  if (role === "host") return;
  if (meeting.settings.locked) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: ctx.t("meetings.errors.locked"),
    });
  }
  if (!meeting.settings.allowGuests && !userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: ctx.t("meetings.errors.signInRequired"),
    });
  }
}

export const joinRouter = createTRPCRouter({
  /**
   * The one door into a room. Public because guests have no account; every
   * refusal is a fixed, translated code so a caller cannot learn whether a
   * meeting exists by the shape of the error.
   *
   * Returns either an admitted session (token in hand — connect now) or a
   * pending join request to poll with `status` while the host decides.
   */
  request: publicProcedure
    .input(joinRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const ip = await getRequestIp();
      if (
        (await isRateLimited(meetingJoinRatelimit, `${ip}:${input.code}`)) ||
        (await isRateLimited(meetingCodeRatelimit, input.code))
      ) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: ctx.t("meetings.errors.rateLimited"),
        });
      }

      const meeting = await findMeetingByCode(ctx.db, input.code);
      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("meetings.errors.notFound"),
        });
      }

      const userId = ctx.session?.user.id ?? null;
      const role: MeetingRole =
        userId === meeting.hostId ? "host" : "participant";
      assertJoinable(ctx, meeting, role, userId);

      // An emailed invite is a credential the host handed to a named person:
      // it stands in for the passcode and skips the waiting room.
      const invited =
        role !== "host" &&
        input.inviteToken != null &&
        (await ctx.db.query.MeetingInvitesTable.findFirst({
          where: and(
            eq(MeetingInvitesTable.meetingId, meeting.id),
            eq(MeetingInvitesTable.token, input.inviteToken),
          ),
          columns: { id: true },
        })) != null;

      if (
        role !== "host" &&
        !invited &&
        meeting.passcodeHash &&
        meeting.passcodeSalt
      ) {
        const ok =
          input.passcode != null &&
          (await comparePasswords({
            password: input.passcode,
            salt: meeting.passcodeSalt,
            hashedPassword: meeting.passcodeHash,
          }));
        if (!ok) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: ctx.t("meetings.errors.wrongPasscode"),
          });
        }
      }

      const identity = userId ? hostIdentity(userId) : guestIdentity();

      if (role === "host" || invited || !meeting.settings.waitingRoom) {
        return admit(meeting, identity, input.displayName, role);
      }

      const [request] = await ctx.db
        .insert(JoinRequestsTable)
        .values({
          meetingId: meeting.id,
          identity,
          displayName: input.displayName,
          userId,
        })
        .returning({ id: JoinRequestsTable.id });
      if (!request) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      return { status: "pending" as const, requestId: request.id };
    }),

  /**
   * Polled by a waiting browser every couple of seconds. Each poll is also
   * the heartbeat that keeps the request in the host's queue. Once admitted
   * the token is minted here — nothing credential-like is ever stored.
   */
  status: publicProcedure
    .input(z.object({ requestId: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.query.JoinRequestsTable.findFirst({
        where: eq(JoinRequestsTable.id, input.requestId),
        with: { meeting: true },
      });
      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: ctx.t("meetings.errors.notFound"),
        });
      }

      if (request.status === "pending") {
        await ctx.db
          .update(JoinRequestsTable)
          .set({ lastSeenAt: new Date() })
          .where(eq(JoinRequestsTable.id, request.id));
        if (request.meeting.status === "ended") {
          return { status: "ended" as const };
        }
        return { status: "pending" as const };
      }

      if (request.status === "denied") return { status: "denied" as const };

      if (request.meeting.status === "ended") {
        return { status: "ended" as const };
      }
      return admit(
        request.meeting,
        request.identity,
        request.displayName,
        "participant",
      );
    }),

  /** The waiting person gave up — drop the request so the host's queue is honest. */
  cancel: publicProcedure
    .input(z.object({ requestId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(JoinRequestsTable)
        .where(
          and(
            eq(JoinRequestsTable.id, input.requestId),
            eq(JoinRequestsTable.status, "pending"),
          ),
        );
      return { ok: true };
    }),
});
