import { eventType } from "inngest";
import { z } from "zod";

/**
 * A `billing_events` row exists (authenticated, id claimed); apply it.
 * Only the row id travels — the payload is read back inside the function
 * so a retry processes exactly what was stored.
 */
export const billingWebhookReceivedEvent = eventType(
  "billing/webhook.received",
  {
    schema: z.object({
      billingEventId: z.uuid(),
      /** For per-org serialisation; null when the org is not yet known. */
      organizationId: z.uuid().nullable(),
    }),
  },
);
