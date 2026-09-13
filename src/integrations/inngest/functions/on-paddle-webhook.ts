import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { env } from "@/data/env/server";
import { db } from "@/drizzle";
import {
  type BillingEventOutcome,
  BillingEventsTable,
  OrganizationsTable,
} from "@/drizzle/schema";
import { parsePaddleEvent } from "@/features/billing/server/paddle-events";
import { subscriptionToPlanChange } from "@/features/billing/server/subscription-mapping";
import {
  applyPaddleSubscription,
  findOrganizationForPaddle,
} from "@/features/billing/server/subscriptions";
import { createPriceMap } from "@/integrations/paddle/prices";
import { inngest } from "../client";
import { paddleWebhookReceivedEvent } from "./billing-events";

const ERROR_TEXT_LIMIT = 500;

/**
 * Applies one stored Paddle event to its organization. Serialised per org
 * (concurrency key) so two events for the same subscription never race;
 * within that, `applyPaddleSubscription` drops anything older than what
 * is already applied. `onFailure` records the error on the row so the
 * admin page shows it instead of it vanishing into retries.
 */
export const onPaddleWebhook = inngest.createFunction(
  {
    id: "on-paddle-webhook",
    triggers: [paddleWebhookReceivedEvent],
    concurrency: [{ key: "event.data.organizationId", limit: 1 }],
    onFailure: async ({ event, error }) => {
      const { billingEventId } = event.data.event.data;
      await markProcessed(billingEventId, "error", error.message);
    },
  },
  async ({ event, step }) => {
    const { billingEventId } = event.data;

    const outcome = await step.run(
      "apply",
      async (): Promise<BillingEventOutcome> => {
        const row = await db.query.BillingEventsTable.findFirst({
          where: eq(BillingEventsTable.id, billingEventId),
        });
        if (!row) throw new NonRetriableError("billing event row missing");

        const prices = createPriceMap({
          pro: env.PADDLE_PRICE_ID_PRO,
          business: env.PADDLE_PRICE_ID_BUSINESS,
        });
        if (!prices) throw new NonRetriableError("Paddle price ids not set");

        const parsed = parsePaddleEvent(row.eventType, row.payload);
        if (parsed.kind === "other") return "skipped_unhandled";

        if (parsed.kind === "transaction") {
          // A completed checkout: remember who paid so the subscription
          // events that follow (which may lack custom data) find the org.
          const organizationId = await findOrganizationForPaddle(db, parsed);
          if (!organizationId) return "skipped_no_org";
          await db
            .update(OrganizationsTable)
            .set({
              ...(parsed.customerId
                ? { paddleCustomerId: parsed.customerId }
                : {}),
              ...(parsed.subscriptionId
                ? { paddleSubscriptionId: parsed.subscriptionId }
                : {}),
              updatedBy: "paddle",
            })
            .where(eq(OrganizationsTable.id, organizationId));
          await setEventOrganization(row.id, organizationId);
          return "applied";
        }

        const organizationId = await findOrganizationForPaddle(db, {
          organizationId: parsed.organizationId,
          subscriptionId: parsed.facts.id,
          customerId: parsed.facts.customerId,
        });
        if (!organizationId) return "skipped_no_org";
        await setEventOrganization(row.id, organizationId);

        const change = subscriptionToPlanChange(
          parsed.facts,
          prices,
          row.occurredAt,
        );
        if (!change) return "skipped_unhandled";
        return applyPaddleSubscription(
          db,
          organizationId,
          change,
          row.occurredAt,
        );
      },
    );

    await step.run("mark-processed", () =>
      markProcessed(billingEventId, outcome),
    );
    return { outcome };
  },
);

async function setEventOrganization(id: string, organizationId: string) {
  await db
    .update(BillingEventsTable)
    .set({ organizationId })
    .where(eq(BillingEventsTable.id, id));
}

async function markProcessed(
  id: string,
  outcome: BillingEventOutcome,
  error?: string,
) {
  await db
    .update(BillingEventsTable)
    .set({
      processedAt: new Date(),
      outcome,
      error: error ? error.slice(0, ERROR_TEXT_LIMIT) : null,
    })
    .where(eq(BillingEventsTable.id, id));
}
