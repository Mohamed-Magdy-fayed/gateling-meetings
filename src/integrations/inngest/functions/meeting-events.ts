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

/**
 * The LiveKit room actually opened. `endsAt` is when the owning org's plan
 * says it must close (`null` = never); it arms the duration enforcer.
 */
export const meetingStartedEvent = eventType("meeting/started", {
  schema: z.object({
    meetingId: z.uuid(),
    startedAt: z.iso.datetime(),
    endsAt: z.iso.datetime().nullable(),
  }),
});

/** The room closed (host ended it, everyone left, or the cap hit); disarm. */
export const meetingEndedEvent = eventType("meeting/ended", {
  schema: z.object({ meetingId: z.uuid() }),
});

/**
 * An org invite exists; email the link. The raw token travels in the
 * event because only its hash is stored: the link is single-use, expires
 * in a week, and accepting it requires signing in as the invited address,
 * so the token alone admits nobody.
 */
export const organizationInviteRequestedEvent = eventType(
  "organization/invite.requested",
  {
    schema: z.object({
      tokenId: z.uuid(),
      token: z.string().min(1),
      locale: z.string(),
    }),
  },
);
