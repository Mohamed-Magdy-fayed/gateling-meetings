import { z } from "zod";

import { planValues } from "@/drizzle/schema";
import { translationKey } from "@/features/core/i18n/global";

export const searchSchema = z.object({
  query: z.string().trim().max(128).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const seatLimitSchema = z
  .number()
  .int()
  .min(1, translationKey("admin.validation.seats"))
  .max(10_000, translationKey("admin.validation.seats"));

/**
 * `subscription` is deliberately absent: only billing webhooks may say an
 * org is paying. An admin who wants a paid-equivalent account sets
 * `manual`, which those webhooks then leave alone.
 */
export const adminPlanSourceSchema = z.enum(["free", "manual", "trial"]);

export const setPlanSchema = z.object({
  id: z.uuid(),
  plan: z.enum(planValues),
  planSource: adminPlanSourceSchema,
  seatLimit: seatLimitSchema,
  planExpiresAt: z.date().nullable(),
  planNote: z.string().trim().max(2000).nullable(),
});

export const planGrantSchema = z.object({
  email: z
    .string()
    .trim()
    .pipe(z.email(translationKey("auth.validation.invalidEmail"))),
  plan: z.enum(planValues),
  seatLimit: seatLimitSchema,
  expiresAt: z.date().nullable(),
  note: z.string().trim().max(2000).nullable(),
});

export const grantIdSchema = z.object({ id: z.uuid() });
