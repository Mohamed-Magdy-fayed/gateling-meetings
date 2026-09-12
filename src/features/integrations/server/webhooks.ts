import { and, eq, isNull } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import {
  IntegrationsTable,
  WebhookDeliveriesTable,
  type WebhookEvent,
} from "@/drizzle/schema";
import { webhookRequestedEvent } from "@/integrations/inngest/functions/integration-events";
import { sendEvents } from "@/integrations/inngest/send";

export type OutboundWebhook = {
  integrationId: string;
  event: WebhookEvent;
  data: Record<string, unknown>;
};

/**
 * Records an outbound webhook and asks Inngest to deliver it. Never throws:
 * the meeting change that triggered it has already happened, and an
 * integration that cannot be told about it is an incident to chase, not a
 * reason to fail the host's request. An integration without a webhook URL
 * (or a revoked one) gets no row at all.
 */
export async function enqueueWebhook(
  db: DatabaseOrTransaction,
  { integrationId, event, data }: OutboundWebhook,
): Promise<string | null> {
  try {
    const integration = await db.query.IntegrationsTable.findFirst({
      where: and(
        eq(IntegrationsTable.id, integrationId),
        isNull(IntegrationsTable.revokedAt),
      ),
      columns: { id: true, webhookUrl: true },
    });
    if (!integration?.webhookUrl) return null;

    const [delivery] = await db
      .insert(WebhookDeliveriesTable)
      .values({ integrationId, event, payload: data })
      .returning({ id: WebhookDeliveriesTable.id });
    if (!delivery) return null;

    await sendEvents(webhookRequestedEvent.create({ deliveryId: delivery.id }));
    return delivery.id;
  } catch (error) {
    console.error(`[webhooks] failed to enqueue ${event}`, error);
    return null;
  }
}
