import { eq, sql } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/drizzle";
import { WebhookDeliveriesTable } from "@/drizzle/schema";
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  SIGNATURE_HEADER,
  signWebhook,
} from "@/integrations/webhooks/signature";
import { inngest } from "../client";
import { webhookRequestedEvent } from "./integration-events";

/** A slow endpoint is the integration's problem; ours is not to hang on it. */
const DELIVERY_TIMEOUT_MS = 10_000;
/** Six attempts over roughly an hour (Inngest's default backoff). */
const MAX_RETRIES = 5;
const ERROR_TEXT_LIMIT = 500;

/**
 * POSTs one `webhook_deliveries` row to its integration. A non-2xx or a
 * network error throws, so Inngest retries with backoff; after the last
 * attempt `onFailure` records the failure. A revoked integration or one
 * that dropped its URL is a permanent skip, not a retry.
 */
export const deliverWebhook = inngest.createFunction(
  {
    id: "deliver-webhook",
    triggers: [webhookRequestedEvent],
    retries: MAX_RETRIES,
    onFailure: async ({ event }) => {
      const { deliveryId } = event.data.event.data;
      await db
        .update(WebhookDeliveriesTable)
        .set({ status: "failed" })
        .where(eq(WebhookDeliveriesTable.id, deliveryId));
    },
  },
  async ({ event, step }) => {
    const { deliveryId } = event.data;

    return step.run("deliver", async () => {
      const delivery = await db.query.WebhookDeliveriesTable.findFirst({
        where: eq(WebhookDeliveriesTable.id, deliveryId),
        with: { integration: true },
      });
      if (!delivery) throw new NonRetriableError("unknown delivery");
      if (delivery.status === "delivered") return { skipped: "already" };

      const { integration } = delivery;
      if (
        integration.revokedAt ||
        !integration.webhookUrl ||
        !integration.webhookSecret
      ) {
        await markFailed(deliveryId, "integration has no active webhook");
        throw new NonRetriableError("integration has no active webhook");
      }

      const body = JSON.stringify({
        id: delivery.id,
        event: delivery.event,
        createdAt: delivery.createdAt.toISOString(),
        data: delivery.payload,
      });

      await db
        .update(WebhookDeliveriesTable)
        .set({ attempts: sql`${WebhookDeliveriesTable.attempts} + 1` })
        .where(eq(WebhookDeliveriesTable.id, deliveryId));

      let response: Response;
      try {
        response = await fetch(integration.webhookUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "user-agent": "gateling-meetings-webhooks/1",
            [EVENT_HEADER]: delivery.event,
            [DELIVERY_HEADER]: delivery.id,
            [SIGNATURE_HEADER]: signWebhook(integration.webhookSecret, body),
          },
          body,
          redirect: "manual",
          signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await recordError(deliveryId, message);
        throw new Error(`webhook POST failed: ${message}`);
      }

      if (!response.ok) {
        const message = `HTTP ${response.status}`;
        await recordError(deliveryId, message);
        throw new Error(`webhook rejected: ${message}`);
      }

      await db
        .update(WebhookDeliveriesTable)
        .set({ status: "delivered", deliveredAt: new Date(), lastError: null })
        .where(eq(WebhookDeliveriesTable.id, deliveryId));
      return { delivered: true, status: response.status };
    });
  },
);

async function recordError(deliveryId: string, message: string) {
  await db
    .update(WebhookDeliveriesTable)
    .set({ lastError: message.slice(0, ERROR_TEXT_LIMIT) })
    .where(eq(WebhookDeliveriesTable.id, deliveryId));
}

async function markFailed(deliveryId: string, message: string) {
  await db
    .update(WebhookDeliveriesTable)
    .set({ status: "failed", lastError: message.slice(0, ERROR_TEXT_LIMIT) })
    .where(eq(WebhookDeliveriesTable.id, deliveryId));
}
