import { z } from "zod";

import {
  meetingCodeSchema,
  meetingTitleSchema,
  scheduledMeetingSchema,
} from "@/features/meetings/server/schemas";

/**
 * The companion's tool inputs. Kept apart from the tools so they can be
 * unit-tested without a database, and described field by field because
 * the descriptions are what the model reads.
 */
const wallClockSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  .describe(
    'Local wall-clock time in the person\'s time zone, "YYYY-MM-DDTHH:mm" (24-hour).',
  );

const timezoneSchema = scheduledMeetingSchema.shape.timezone.describe(
  "IANA time zone the wall-clock time is in, e.g. Africa/Cairo.",
);

const MAX_INVITEES = 50;
export const DEFAULT_DURATION_MINUTES = 60;

/** Tool inputs, exported so they can be unit-tested without a database. */
export const companionSchemas = {
  listMyMeetings: z.object({}),
  createInstantMeeting: z.object({
    title: meetingTitleSchema.optional().describe("Optional title."),
  }),
  scheduleMeeting: z.object({
    title: meetingTitleSchema,
    wallClock: wallClockSchema,
    timezone: timezoneSchema,
    durationMinutes: scheduledMeetingSchema.shape.durationMinutes
      .optional()
      .describe("Length in minutes; 60 when not said."),
    invitees: z
      .array(z.email())
      .max(MAX_INVITEES)
      .optional()
      .describe("Email addresses to invite. They get an email with the link."),
  }),
  meetingByCode: z.object({ code: meetingCodeSchema }),
  none: z.object({}),
};
