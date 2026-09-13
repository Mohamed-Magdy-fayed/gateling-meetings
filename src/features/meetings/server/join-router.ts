import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { JoinRequestsTable, MeetingInvitesTable } from "@/drizzle/schema";
import { assertEntitlement, type Entitlements } from "@/features/billing/plans";
import {
  entitlementsForMeeting,
  type MeetingWithOwner,
} from "@/features/billing/server/entitlements";
import { countActiveParticipants } from "@/features/billing/server/usage";
import { comparePasswords } from "@/features/core/auth/core/passwordHasher";
import {
  getLiveKitConfig,
  getRoomService,
} from "@/integrations/livekit/client";
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
  meeting: MeetingWithOwner,
  identity: string,
  displayName: string,
  role: MeetingRole,
): Promise<AdmittedSession> {
  const entitlements = entitlementsForMeeting(meeting);
  const token = await createMeetingToken({
    roomName: meeting.code,
    identity,
    name: displayName,
    role,
    canShareScreen: role === "host" || meeting.settings.allowScreenShare,
    maxParticipants: entitlements.maxParticipants,
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

/**
 * The participant cap. The attendance log is the cheap answer; only when it
 * says "full" do we ask LiveKit, which is the truth — the log lags the
 * webhook→Inngest hop by a few seconds and would otherwise refuse the seat
 * someone just vacated. The host always gets in: the cap counts them, and
 * a room the host cannot enter is useless to everyone.
 */
async function assertRoomHasSpace(
  ctx: Pick<TRPCContext, "db" | "t">,
  meeting: MeetingWithOwner,
  entitlements: Entitlements,
) {
  if (entitlements.maxParticipants >= Number.MAX_SAFE_INTEGER) return;
  const logged = await countActiveParticipants(ctx.db, meeting.id);
  if (logged < entitlements.maxParticipants) return;

  let live = logged;
  try {
    const participants = await getRoomService().listParticipants(meeting.code);
    live = participants.length;
  } catch {
    // Room not created yet (404) or LiveKit unreachable: nobody is in it.
    live = 0;
  }
  assertEntitlement(ctx.t, entitlements, "maxParticipants", live);
}

function assertJoinable(
  ctx: Pick<TRPCContext, "t">,
  meeting: MeetingWithOwner,
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

      if (role === "host") {
        return admit(meeting, identity, input.displayName, role);
      }
      // Checked before the waiting room too: no point queueing someone the
      // host cannot admit.
      await assertRoomHasSpace(ctx, meeting, entitlementsForMeeting(meeting));

      if (invited || !meeting.settings.waitingRoom) {
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
        with: {
          meeting: {
            with: {
              organization: true,
              host: { columns: { id: true, name: true, email: true } },
            },
          },
        },
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
      // The room may have filled while they waited.
      await assertRoomHasSpace(
        ctx,
        request.meeting,
        entitlementsForMeeting(request.meeting),
      );
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
