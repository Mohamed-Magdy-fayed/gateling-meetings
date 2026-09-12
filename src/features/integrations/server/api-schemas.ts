import { z } from "zod";

import { meetingSettingsSchema } from "@/drizzle/schema";
import {
  meetingTitleSchema,
  passcodeSchema,
  scheduledMeetingSchema,
} from "@/features/meetings/server/schemas";
import { MAX_SSO_TTL_SECONDS } from "@/integrations/sso/token";

/**
 * Request bodies for `/api/v1`. Built on the same field schemas the tRPC
 * router uses so a limit tightened there tightens here too; the only
 * JSON-specific twist is that dates arrive as ISO strings.
 */
export const externalUserSchema = z.object({
  externalId: z.string().trim().min(1).max(128),
  name: z.string().trim().min(1).max(64),
  email: z.email().optional(),
});

export const externalRefSchema = z.string().trim().min(1).max(128);

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

export const createMeetingBodySchema = z.object({
  title: meetingTitleSchema,
  host: externalUserSchema,
  externalRef: externalRefSchema.optional(),
  /** Present → scheduled meeting; absent → live right now. */
  scheduledAt: isoDate.optional(),
  durationMinutes: scheduledMeetingSchema.shape.durationMinutes.optional(),
  timezone: scheduledMeetingSchema.shape.timezone.optional(),
  passcode: passcodeSchema.optional(),
  settings: meetingSettingsSchema.partial().optional(),
  invitees: scheduledMeetingSchema.shape.invitees.optional(),
});

export type CreateMeetingBody = z.infer<typeof createMeetingBodySchema>;

export const updateMeetingBodySchema = z
  .object({
    title: meetingTitleSchema,
    scheduledAt: isoDate,
    durationMinutes: scheduledMeetingSchema.shape.durationMinutes,
    timezone: scheduledMeetingSchema.shape.timezone,
    /** `""` removes the passcode. */
    passcode: z.union([z.literal(""), passcodeSchema]),
    settings: meetingSettingsSchema.partial(),
    externalRef: externalRefSchema.nullable(),
  })
  .partial();

export type UpdateMeetingBody = z.infer<typeof updateMeetingBodySchema>;

export const joinLinkBodySchema = z.object({
  user: externalUserSchema,
  role: z.enum(["host", "participant"]),
  /** Seconds; default 10 minutes, at most 24 hours. */
  expiresIn: z.number().int().min(60).max(MAX_SSO_TTL_SECONDS).optional(),
  returnUrl: z.url().max(2048).optional(),
});

export type JoinLinkBody = z.infer<typeof joinLinkBodySchema>;

export const listMeetingsQuerySchema = z.object({
  externalRef: externalRefSchema.optional(),
  status: z.enum(["scheduled", "live", "ended"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
