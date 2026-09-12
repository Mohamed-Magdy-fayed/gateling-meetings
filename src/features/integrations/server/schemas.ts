import { z } from "zod";

import { translationKey } from "@/features/core/i18n/global";

export const INTEGRATION_SLUG_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

export const integrationSlugSchema = z
  .string()
  .trim()
  .min(2, translationKey("integrations.admin.validation.slug"))
  .max(64, translationKey("integrations.admin.validation.slug"))
  .regex(
    INTEGRATION_SLUG_PATTERN,
    translationKey("integrations.admin.validation.slug"),
  );

export const integrationNameSchema = z
  .string()
  .trim()
  .min(1, translationKey("forms.validation.required"))
  .max(128, translationKey("forms.validation.max128"));

/**
 * `https://` only once deployed. Locally an `http://127.0.0.1:<port>` receiver
 * is exactly what the e2e uses, and there is no TLS to be had there.
 */
export function isAcceptableWebhookUrl(
  value: string,
  isDeployed: boolean,
): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol === "https:") return true;
  if (url.protocol !== "http:") return false;
  return !isDeployed;
}

/**
 * Syntax only — the "https once deployed" rule is enforced by the router
 * (`isAcceptableWebhookUrl`), which knows whether it is deployed; the
 * browser bundle does not.
 */
export const webhookUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .refine((value) => isAcceptableWebhookUrl(value, false), {
    message: translationKey("integrations.admin.validation.webhookHttps"),
  });

/** An origin, not a URL: `https://host[:port]` with nothing after. */
export function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      url.origin === value
    );
  } catch {
    return false;
  }
}

export const returnOriginsSchema = z
  .array(
    z
      .string()
      .trim()
      .refine(isOrigin, {
        message: translationKey("integrations.admin.validation.origin"),
      }),
  )
  .max(20);

export const createIntegrationSchema = z.object({
  name: integrationNameSchema,
  slug: integrationSlugSchema,
  webhookUrl: z.union([z.literal(""), webhookUrlSchema]).default(""),
  allowedReturnOrigins: returnOriginsSchema.default([]),
});

export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

export const integrationIdSchema = z.object({ id: z.uuid() });
