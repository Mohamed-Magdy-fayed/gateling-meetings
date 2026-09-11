import { z } from "zod";

import { meetingSettingsSchema } from "@/drizzle/schemas/meetings";
import { translationKey } from "@/features/core/i18n/global";
import { MEETING_CODE_PATTERN } from "@/features/meetings/lib/meeting-code";

export const meetingCodeSchema = z
  .string()
  .regex(
    MEETING_CODE_PATTERN,
    translationKey("meetings.validation.invalidCode"),
  );

export const meetingTitleSchema = z
  .string()
  .trim()
  .min(1, translationKey("forms.validation.required"))
  .max(200, translationKey("forms.validation.max200"));

/** 4–16 chars is Zoom's range; long enough to matter, short enough to read out. */
export const passcodeSchema = z
  .string()
  .trim()
  .min(4, translationKey("meetings.validation.passcodeLength"))
  .max(16, translationKey("meetings.validation.passcodeLength"));

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, translationKey("meetings.validation.nameRequired"))
  .max(64, translationKey("meetings.validation.nameTooLong"));

export const createInstantMeetingSchema = z.object({
  title: meetingTitleSchema.optional(),
});

export const updateMeetingSettingsSchema = z.object({
  code: meetingCodeSchema,
  settings: meetingSettingsSchema.partial(),
});

export const joinRequestSchema = z.object({
  code: meetingCodeSchema,
  displayName: displayNameSchema,
  passcode: z.string().trim().max(16).optional(),
  /** From an emailed invite link — skips passcode and waiting room. */
  inviteToken: z.string().max(64).optional(),
});

export type JoinRequestInput = z.infer<typeof joinRequestSchema>;

const timezoneSchema = z
  .string()
  .max(64)
  .refine(
    (value) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    },
    { message: translationKey("meetings.validation.invalidTimezone") },
  );

const emailListSchema = z
  .array(z.email(translationKey("auth.validation.invalidEmail")))
  .max(50);

export const scheduledMeetingSchema = z.object({
  title: meetingTitleSchema,
  /** An absolute instant; the form converts the wall-clock time + timezone. */
  scheduledAt: z.date(),
  durationMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60),
  timezone: timezoneSchema,
  /** `""` = no passcode. Hashed on write; never returned. */
  passcode: z.union([z.literal(""), passcodeSchema]).optional(),
  waitingRoom: z.boolean().default(true),
  invitees: emailListSchema.default([]),
});

export const updateMeetingSchema = scheduledMeetingSchema
  .omit({ invitees: true })
  .partial()
  .extend({ code: meetingCodeSchema });

export const sendInvitesSchema = z.object({
  code: meetingCodeSchema,
  emails: emailListSchema.min(1),
});
