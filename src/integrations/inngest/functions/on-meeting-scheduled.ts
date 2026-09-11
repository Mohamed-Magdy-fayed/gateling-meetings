import { and, eq, isNull } from "drizzle-orm";

import { baseUrl } from "@/data/env/server";
import { db } from "@/drizzle";
import { MeetingInvitesTable } from "@/drizzle/schema";
import {
  inviteUrl,
  sendReminderEmail,
} from "@/features/meetings/server/emails";
import { inngest } from "../client";
import { meetingScheduledEvent } from "./meeting-events";
import { loadMeetingWithHost } from "./meeting-loaders";

const REMINDER_LEAD_MS = 10 * 60_000;

/**
 * Sleeps until ten minutes before the start, then reminds the host and
 * every invitee. `cancelOn` disarms it when the meeting is rescheduled or
 * deleted (the router emits `meeting/schedule.changed` for both), and a
 * fresh `meeting/scheduled` arms a new one — so the sleep never fires for
 * a time that no longer exists.
 */
export const onMeetingScheduled = inngest.createFunction(
  {
    id: "on-meeting-scheduled",
    triggers: [meetingScheduledEvent],
    cancelOn: [{ event: "meeting/schedule.changed", match: "data.meetingId" }],
  },
  async ({ event, step }) => {
    const remindAt = new Date(
      new Date(event.data.scheduledAt).getTime() - REMINDER_LEAD_MS,
    );
    if (remindAt.getTime() > Date.now()) {
      await step.sleepUntil("until-ten-minutes-before", remindAt);
    }

    // Belt and braces: the time we slept for must still be the meeting's time.
    const isCurrent = await step.run("check-still-current", async () => {
      const meeting = await loadMeetingWithHost(event.data.meetingId);
      return (
        meeting != null &&
        meeting.status !== "ended" &&
        meeting.scheduledAt?.toISOString() === event.data.scheduledAt
      );
    });
    if (!isCurrent) return { skipped: "stale" };

    await step.run("remind-host", async () => {
      const meeting = await loadMeetingWithHost(event.data.meetingId);
      if (!meeting) return;
      await sendReminderEmail({
        meeting,
        host: meeting.host,
        to: {
          email: meeting.host.email,
          name: meeting.host.name,
          url: `${baseUrl}/m/${meeting.code}`,
        },
        locale: "en",
      });
    });

    const inviteIds = await step.run("load-invites", async () => {
      const rows = await db.query.MeetingInvitesTable.findMany({
        where: and(
          eq(MeetingInvitesTable.meetingId, event.data.meetingId),
          isNull(MeetingInvitesTable.remindedAt),
        ),
        columns: { id: true },
      });
      return rows.map((row) => row.id);
    });

    for (const inviteId of inviteIds) {
      await step.run(`remind-${inviteId}`, async () => {
        const meeting = await loadMeetingWithHost(event.data.meetingId);
        const invite = await db.query.MeetingInvitesTable.findFirst({
          where: eq(MeetingInvitesTable.id, inviteId),
        });
        if (!meeting || !invite || invite.remindedAt) return;
        await sendReminderEmail({
          meeting,
          host: meeting.host,
          to: {
            email: invite.email,
            name: invite.name,
            url: inviteUrl(meeting, invite.token),
          },
          locale: "en",
        });
        await db
          .update(MeetingInvitesTable)
          .set({ remindedAt: new Date() })
          .where(eq(MeetingInvitesTable.id, inviteId));
      });
    }

    return { reminded: inviteIds.length + 1 };
  },
);
