import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/drizzle";
import { MeetingInvitesTable } from "@/drizzle/schema";
import { sendInviteEmail } from "@/features/meetings/server/emails";
import { inngest } from "../client";
import { meetingInvitesRequestedEvent } from "./meeting-events";
import { loadMeetingWithHost } from "./meeting-loaders";

export const onMeetingInvitesRequested = inngest.createFunction(
  {
    id: "on-meeting-invites-requested",
    triggers: [meetingInvitesRequestedEvent],
  },
  async ({ event, step }) => {
    // Only rows never sent: a retry after a partial failure resumes where it
    // stopped instead of emailing the first invitees twice.
    const inviteIds = await step.run("load-unsent-invites", async () => {
      const rows = await db.query.MeetingInvitesTable.findMany({
        where: and(
          inArray(MeetingInvitesTable.id, event.data.inviteIds),
          isNull(MeetingInvitesTable.sentAt),
        ),
        columns: { id: true },
      });
      return rows.map((row) => row.id);
    });

    let sent = 0;
    for (const inviteId of inviteIds) {
      const result = await step.run(`send-${inviteId}`, async () => {
        const meeting = await loadMeetingWithHost(event.data.meetingId);
        if (!meeting) return "meeting-gone";
        const invite = await db.query.MeetingInvitesTable.findFirst({
          where: eq(MeetingInvitesTable.id, inviteId),
        });
        if (!invite || invite.sentAt) return "already-sent";

        await sendInviteEmail({
          meeting,
          host: meeting.host,
          invite,
          locale: "en",
        });
        await db
          .update(MeetingInvitesTable)
          .set({ sentAt: new Date() })
          .where(eq(MeetingInvitesTable.id, inviteId));
        return "sent";
      });
      if (result === "sent") sent++;
    }

    return { sent };
  },
);
