import { z } from "zod";

/**
 * Per-meeting host preferences, stored as one jsonb column so adding a toggle
 * is a schema-default change rather than a migration. Every field has a
 * default so a row written by an older version of the app still parses.
 */
export const meetingSettingsSchema = z.object({
  /** Guests wait for the host to admit them instead of joining directly. */
  waitingRoom: z.boolean().default(true),
  /** Participants join with their microphone off. */
  muteOnEntry: z.boolean().default(false),
  /** People without an account may join by link. Off = hosts' accounts only. */
  allowGuests: z.boolean().default(true),
  /** Non-host participants may share their screen. */
  allowScreenShare: z.boolean().default(true),
  /** Nobody new can join, even with the link and passcode. */
  locked: z.boolean().default(false),
});

export type MeetingSettings = z.infer<typeof meetingSettingsSchema>;

export const DEFAULT_MEETING_SETTINGS: MeetingSettings =
  meetingSettingsSchema.parse({});
