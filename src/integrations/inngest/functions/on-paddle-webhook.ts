import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/drizzle";
import {
  type BillingEventOutcome,
  BillingEventsTable,
  OrganizationsTable,
} from "@/drizzle/schema";
import {
  upsertPaddleCustomer,
  upsertPaddleSubscription,
} from "@/features/billing/server/mirror";
import { parsePaddleEvent } from "@/features/billing/server/paddle-events";
import { getPriceMap } from "@/features/billing/server/price-map";
import { subscriptionToPlanChange } from "@/features/billing/server/subscription-mapping";
import {
  applyPaddleSubscription,
  findOrganizationForPaddle,
} from "@/features/billing/server/subscriptions";
import { inngest } from "../client";
import { paddleWebhookReceivedEvent } from "./billing-events";

const ERROR_TEXT_LIMIT = 500;

/**
 * Applies one stored Paddle event. Two things happen, in order:
 *
 * 1. The Paddle entity is mirrored into `paddle_customers` /
 *    `paddle_subscriptions` exactly as sent — always, even when no org is
 *    known yet, so the mirror is complete and can be re-linked later.
 * 2. For subscription events, the org's plan is derived and landed on
 *    `organizations` (the part that actually grants access).
 *
 * Serialised per org (concurrency key) so two events for the same
 * subscription never race; within that, `applyPaddleSubscription` and the
 * mirror upserts drop anything older than what is already applied.
 * `onFailure` records the error on the row so the admin page shows it
 * instead of it vanishing into retries.
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

        const parsed = parsePaddleEvent(row.eventType, row.payload);
        switch (parsed.kind) {
          case "other":
            return "skipped_unhandled";
          case "customer":
            return applyCustomer(row.id, parsed.facts, row.occurredAt);
          case "transaction":
            return applyTransaction(row.id, parsed);
          case "subscription":
            return applySubscription(
              row.id,
              parsed.facts,
              parsed.organizationId,
              row.occurredAt,
            );
        }
      },
    );

    await step.run("mark-processed", () =>
      markProcessed(billingEventId, outcome),
    );
    return { outcome };
  },
);

type Parsed = ReturnType<typeof parsePaddleEvent>;

/** `customer.created` / `customer.updated`: mirror, and link to the org that paid as this customer. */
async function applyCustomer(
  billingEventId: string,
  facts: Extract<Parsed, { kind: "customer" }>["facts"],
  occurredAt: Date,
): Promise<BillingEventOutcome> {
  const organizationId = await findOrganizationForPaddle(db, {
    customerId: facts.id,
  });
  await upsertPaddleCustomer(db, facts, organizationId, occurredAt);
  if (organizationId)
    await setEventOrganization(billingEventId, organizationId);
  return "applied";
}

/**
 * A completed checkout: remember who paid so the subscription events that
 * follow (which may lack custom data) find the org.
 */
async function applyTransaction(
  billingEventId: string,
  parsed: Extract<Parsed, { kind: "transaction" }>,
): Promise<BillingEventOutcome> {
  const organizationId = await findOrganizationForPaddle(db, parsed);
  if (!organizationId) return "skipped_no_org";
  await db
    .update(OrganizationsTable)
    .set({
      ...(parsed.customerId ? { paddleCustomerId: parsed.customerId } : {}),
      ...(parsed.subscriptionId
        ? { paddleSubscriptionId: parsed.subscriptionId }
        : {}),
      updatedBy: "paddle",
    })
    .where(eq(OrganizationsTable.id, organizationId));
  await setEventOrganization(billingEventId, organizationId);
  return "applied";
}

async function applySubscription(
  billingEventId: string,
  facts: Extract<Parsed, { kind: "subscription" }>["facts"],
  hintedOrganizationId: string | null,
  occurredAt: Date,
): Promise<BillingEventOutcome> {
  const organizationId = await findOrganizationForPaddle(db, {
    organizationId: hintedOrganizationId,
    subscriptionId: facts.id,
    customerId: facts.customerId,
  });
  await upsertPaddleSubscription(db, facts, organizationId, occurredAt);
  if (!organizationId) return "skipped_no_org";
  await setEventOrganization(billingEventId, organizationId);

  const prices = getPriceMap();
  if (!prices) throw new NonRetriableError("Paddle price ids not set");
  const change = subscriptionToPlanChange(facts, prices, occurredAt);
  if (!change) return "skipped_unhandled";
  return applyPaddleSubscription(db, organizationId, change, occurredAt);
}

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
