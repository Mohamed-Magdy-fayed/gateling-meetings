import { z } from "zod";

import type { SubscriptionFacts } from "./subscription-mapping";

/**
 * The parts of a Paddle event payload this app reads, parsed from the raw
 * JSON rather than the SDK's class instances so the stored `billing_events`
 * row can be re-processed later without the SDK in the loop.
 */
const customDataSchema = z
  .object({ organizationId: z.uuid().optional() })
  .passthrough()
  .nullable()
  .optional();

const subscriptionDataSchema = z.object({
  id: z.string(),
  customer_id: z.string(),
  status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]),
  items: z.array(
    z.object({
      quantity: z.number().int(),
      price: z.object({ id: z.string() }).nullable().optional(),
    }),
  ),
  current_billing_period: z
    .object({ ends_at: z.string() })
    .nullable()
    .optional(),
  scheduled_change: z
    .object({ action: z.string(), effective_at: z.string() })
    .nullable()
    .optional(),
  custom_data: customDataSchema,
});

const transactionDataSchema = z.object({
  id: z.string(),
  customer_id: z.string().nullable().optional(),
  subscription_id: z.string().nullable().optional(),
  custom_data: customDataSchema,
});

export const SUBSCRIPTION_EVENTS = new Set([
  "subscription.created",
  "subscription.activated",
  "subscription.updated",
  "subscription.canceled",
  "subscription.past_due",
  "subscription.paused",
  "subscription.resumed",
  "subscription.trialing",
]);

export type ParsedPaddleEvent =
  | {
      kind: "subscription";
      facts: SubscriptionFacts;
      organizationId: string | null;
    }
  | {
      kind: "transaction";
      customerId: string | null;
      subscriptionId: string | null;
      organizationId: string | null;
    }
  | { kind: "other" };

export function parsePaddleEvent(
  eventType: string,
  payload: Record<string, unknown>,
): ParsedPaddleEvent {
  const data = (payload as { data?: unknown }).data;
  if (SUBSCRIPTION_EVENTS.has(eventType)) {
    const sub = subscriptionDataSchema.parse(data);
    return {
      kind: "subscription",
      facts: {
        id: sub.id,
        customerId: sub.customer_id,
        status: sub.status,
        items: sub.items.map((item) => ({
          priceId: item.price?.id ?? null,
          quantity: item.quantity,
        })),
        currentBillingPeriod: sub.current_billing_period
          ? { endsAt: sub.current_billing_period.ends_at }
          : null,
        scheduledChange: sub.scheduled_change
          ? {
              action: sub.scheduled_change.action,
              effectiveAt: sub.scheduled_change.effective_at,
            }
          : null,
      },
      organizationId: sub.custom_data?.organizationId ?? null,
    };
  }
  if (eventType === "transaction.completed") {
    const tx = transactionDataSchema.parse(data);
    return {
      kind: "transaction",
      customerId: tx.customer_id ?? null,
      subscriptionId: tx.subscription_id ?? null,
      organizationId: tx.custom_data?.organizationId ?? null,
    };
  }
  return { kind: "other" };
}
