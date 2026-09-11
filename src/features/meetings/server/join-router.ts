import crypto from "node:crypto";
import { TRPCError } from "@trpc/server";

import { comparePasswords } from "@/features/core/auth/core/passwordHasher";
import { getLiveKitConfig } from "@/integrations/livekit/client";
import {
  createMeetingToken,
  type MeetingRole,
} from "@/integrations/livekit/token";
import {
  getRequestIp,
  isRateLimited,
  meetingJoinRatelimit,
} from "@/integrations/ratelimit";
import { createTRPCRouter, publicProcedure } from "@/integrations/trpc/init";
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

export const joinRouter = createTRPCRouter({
  /**
   * The one door into a room. Public because guests have no account; every
   * refusal is a fixed, translated code so a caller cannot learn whether a
   * meeting exists by the shape of the error.
   */
  request: publicProcedure
    .input(joinRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const ip = await getRequestIp();
      if (await isRateLimited(meetingJoinRatelimit, `${ip}:${input.code}`)) {
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

      if (meeting.status === "ended") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ctx.t("meetings.errors.ended"),
        });
      }

      if (role !== "host") {
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
        if (meeting.passcodeHash && meeting.passcodeSalt) {
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
      }

      const identity = userId ? hostIdentity(userId) : guestIdentity();
      const token = await createMeetingToken({
        roomName: meeting.code,
        identity,
        name: input.displayName,
        role,
        canShareScreen: role === "host" || meeting.settings.allowScreenShare,
      });

      return {
        status: "admitted" as const,
        token,
        serverUrl: getLiveKitConfig().url,
        identity,
        role,
        muteOnEntry: role !== "host" && meeting.settings.muteOnEntry,
      };
    }),
});
