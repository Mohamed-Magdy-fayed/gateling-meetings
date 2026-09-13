import { and, eq, isNull } from "drizzle-orm";
import { eventType } from "inngest";
import { z } from "zod";

import { db } from "@/drizzle";
import { MeetingParticipantsTable, MeetingsTable } from "@/drizzle/schema";
import { meetingEndsAt } from "@/features/billing/plans";
import { entitlementsForMeeting } from "@/features/billing/server/entitlements";
import { enqueueWebhook } from "@/features/integrations/server/webhooks";
import { findMeetingById } from "@/features/meetings/server/queries";
import { toWebhookMeeting } from "@/features/meetings/server/service";
import { PARTICIPANT_ATTRIBUTE_ROLE } from "@/integrations/livekit/attributes";
import { inngest } from "../client";
import { meetingEndedEvent, meetingStartedEvent } from "./meeting-events";

/**
 * A LiveKit webhook, verified by `/api/livekit/webhook` and handed off here
 * so the HTTP handler answers in milliseconds and a transient DB hiccup is
 * retried by Inngest rather than lost.
 */
export const liveKitWebhookEvent = eventType("livekit/webhook.received", {
  schema: z.object({
    event: z.string(),
    /** LiveKit room name = our meeting code. */
    room: z.string().min(1),
    /** Seconds since epoch, as LiveKit sends it. */
    createdAt: z.number(),
    participant: z
      .object({
        identity: z.string(),
        name: z.string(),
        attributes: z.record(z.string(), z.string()),
      })
      .optional(),
  }),
});

export const onLiveKitWebhook = inngest.createFunction(
  { id: "on-livekit-webhook", triggers: [liveKitWebhookEvent] },
  async ({ event, step }) => {
    const { room, participant } = event.data;
    const at = new Date(event.data.createdAt * 1000);

    const meeting = await step.run("find-meeting", () =>
      db.query.MeetingsTable.findFirst({
        where: eq(MeetingsTable.code, room),
        columns: {
          id: true,
          status: true,
          hostId: true,
          integrationId: true,
          isPersonalRoom: true,
        },
      }),
    );
    if (!meeting) return { skipped: "unknown-room" };

    /**
     * Tells the integration that created this meeting what just happened.
     * The role is derived from the identity against the meeting's host —
     * participant attributes are client-writable and never trusted here.
     */
    const notify = (
      eventName:
        | "meeting.started"
        | "meeting.ended"
        | "participant.joined"
        | "participant.left",
      extra: Record<string, unknown> = {},
    ) =>
      meeting.integrationId
        ? step.run(`notify-${eventName}`, async () => {
            const current = await db.query.MeetingsTable.findFirst({
              where: eq(MeetingsTable.id, meeting.id),
            });
            if (!current?.integrationId) return;
            await enqueueWebhook(db, {
              integrationId: current.integrationId,
              event: eventName,
              data: { meeting: toWebhookMeeting(current), ...extra },
            });
          })
        : Promise.resolve();

    const participantData = () =>
      participant
        ? {
            participant: {
              identity: participant.identity,
              name: participant.name || participant.identity,
              role:
                participant.identity === `user:${meeting.hostId}`
                  ? "host"
                  : "participant",
            },
            at: at.toISOString(),
          }
        : {};

    switch (event.data.event) {
      case "room_started": {
        if (meeting.status === "ended") return { skipped: "already-ended" };
        // A scheduled meeting goes live when the first person (the host —
        // guests wait) actually connects. `startedAt` is (re)stamped for
        // instant and personal rooms too: it is the clock the plan's
        // duration cap runs on, and a personal room opens many times.
        await step.run("mark-live", () =>
          db
            .update(MeetingsTable)
            .set({ status: "live", startedAt: at })
            .where(eq(MeetingsTable.id, meeting.id)),
        );
        const endsAt = await step.run("resolve-cap", async () => {
          const fresh = await findMeetingById(db, meeting.id);
          if (!fresh) return null;
          return (
            meetingEndsAt(at, entitlementsForMeeting(fresh))?.toISOString() ??
            null
          );
        });
        await step.sendEvent(
          "arm-duration-cap",
          meetingStartedEvent.create({
            meetingId: meeting.id,
            startedAt: at.toISOString(),
            endsAt,
          }),
        );
        await notify("meeting.started", { at: at.toISOString() });
        return { handled: "room_started" };
      }

      case "room_finished":
        // A personal room is never "ended" (the link is permanent), and a
        // meeting the host ended from the UI/API already told the
        // integration — only the SFU-initiated end is news here.
        if (meeting.status !== "ended" && !meeting.isPersonalRoom) {
          await step.run("mark-ended", () =>
            db
              .update(MeetingsTable)
              .set({ status: "ended", endedAt: at })
              .where(eq(MeetingsTable.id, meeting.id)),
          );
          await notify("meeting.ended", { endedBy: "room" });
        }
        // Always — a personal room's timer must not outlive its session.
        await step.sendEvent(
          "disarm-duration-cap",
          meetingEndedEvent.create({ meetingId: meeting.id }),
        );
        return { handled: "room_finished" };

      case "participant_joined": {
        if (!participant) return { skipped: "no-participant" };
        const userId = participant.identity.startsWith("user:")
          ? participant.identity.slice("user:".length)
          : null;
        await step.run("log-join", async () => {
          // Belt and braces alongside the event id: the same connection is
          // never logged twice even if a duplicate slips through.
          const existing = await db.query.MeetingParticipantsTable.findFirst({
            where: and(
              eq(MeetingParticipantsTable.meetingId, meeting.id),
              eq(MeetingParticipantsTable.identity, participant.identity),
              eq(MeetingParticipantsTable.joinedAt, at),
            ),
            columns: { id: true },
          });
          if (existing) return;
          await db.insert(MeetingParticipantsTable).values({
            meetingId: meeting.id,
            identity: participant.identity,
            displayName: participant.name || participant.identity,
            userId,
            role:
              participant.attributes[PARTICIPANT_ATTRIBUTE_ROLE] ??
              "participant",
            joinedAt: at,
          });
        });
        await notify("participant.joined", participantData());
        return { handled: "participant_joined" };
      }

      case "participant_left":
        if (!participant) return { skipped: "no-participant" };
        await step.run("log-leave", () =>
          db
            .update(MeetingParticipantsTable)
            .set({ leftAt: at })
            .where(
              and(
                eq(MeetingParticipantsTable.meetingId, meeting.id),
                eq(MeetingParticipantsTable.identity, participant.identity),
                isNull(MeetingParticipantsTable.leftAt),
              ),
            ),
        );
        await notify("participant.left", participantData());
        return { handled: "participant_left" };

      default:
        return { skipped: event.data.event };
    }
  },
);
