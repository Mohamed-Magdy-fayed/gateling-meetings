import { eventType } from "inngest";
import { z } from "zod";

/**
 * Meeting lifecycle events. Kept in one file (and separate from the
 * functions) so routers can import the event types without dragging the
 * function implementations — and their DB/mail imports — into the router.
 */

/** New invite rows exist; email each one. */
export const meetingInvitesRequestedEvent = eventType(
  "meeting/invites.requested",
  {
    schema: z.object({
      meetingId: z.uuid(),
      inviteIds: z.array(z.uuid()).min(1),
    }),
  },
);

/** A meeting has a (new) start time; arm the reminder. */
export const meetingScheduledEvent = eventType("meeting/scheduled", {
  schema: z.object({
    meetingId: z.uuid(),
    scheduledAt: z.iso.datetime(),
  }),
});

/** The start time changed or the meeting was deleted; disarm the old reminder. */
export const meetingScheduleChangedEvent = eventType(
  "meeting/schedule.changed",
  { schema: z.object({ meetingId: z.uuid() }) },
);
