import { eventType } from "inngest";
import { z } from "zod";

/**
 * A `webhook_deliveries` row exists; POST it to the integration. Only the
 * id travels — the payload is read from the row inside the function so a
 * retry always sends exactly what the admin page shows.
 */
export const webhookRequestedEvent = eventType(
  "integration/webhook.requested",
  {
    schema: z.object({ deliveryId: z.uuid() }),
  },
);
