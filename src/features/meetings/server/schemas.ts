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
});

export type JoinRequestInput = z.infer<typeof joinRequestSchema>;
