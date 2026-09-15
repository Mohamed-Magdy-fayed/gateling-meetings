import { eq, lte } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  PaddleCustomersTable,
  PaddleSubscriptionsTable,
} from "@/drizzle/schema";
import {
  type CustomerFacts,
  type SubscriptionFacts,
  toDate,
} from "./subscription-mapping";

/**
 * Upserts keyed on Paddle's ids, so a redelivered event is a no-op and a
 * `subscription.updated` that overtakes its `subscription.created` is not
 * undone when the older one finally lands: the row only moves forward in
 * `syncedAt`.
 */
export async function upsertPaddleCustomer(
  db: Database,
  facts: CustomerFacts,
  organizationId: string | null,
  occurredAt: Date,
): Promise<void> {
  const values = {
    email: facts.email,
    name: facts.name,
    status: facts.status,
    organizationId,
    syncedAt: occurredAt,
  };
  await db
    .insert(PaddleCustomersTable)
    .values({ id: facts.id, ...values })
    .onConflictDoUpdate({
      target: PaddleCustomersTable.id,
      set: values,
      setWhere: lte(PaddleCustomersTable.syncedAt, occurredAt),
    });
}

export async function upsertPaddleSubscription(
  db: Database,
  facts: SubscriptionFacts,
  organizationId: string | null,
  occurredAt: Date,
): Promise<void> {
  // Paddle subscriptions carry one item per price; ours are single-price
  // per-seat, so the first item is the subscription.
  const item = facts.items[0];
  const values = {
    customerId: facts.customerId,
    organizationId,
    status: facts.status,
    priceId: item?.priceId ?? null,
    productId: item?.productId ?? null,
    quantity: Math.max(1, item?.quantity ?? 1),
    currentPeriodStartsAt: toDate(facts.currentBillingPeriod?.startsAt),
    currentPeriodEndsAt: toDate(facts.currentBillingPeriod?.endsAt),
    scheduledChangeAction: facts.scheduledChange?.action ?? null,
    scheduledChangeAt: toDate(facts.scheduledChange?.effectiveAt),
    canceledAt: toDate(facts.canceledAt),
    pausedAt: toDate(facts.pausedAt),
    syncedAt: occurredAt,
  };
  await db
    .insert(PaddleSubscriptionsTable)
    .values({ id: facts.id, ...values })
    .onConflictDoUpdate({
      target: PaddleSubscriptionsTable.id,
      set: values,
      setWhere: lte(PaddleSubscriptionsTable.syncedAt, occurredAt),
    });
}

/** The mirrored subscription an org is on, for the billing summary. */
export async function findMirroredSubscription(
  db: Database,
  subscriptionId: string,
) {
  return db.query.PaddleSubscriptionsTable.findFirst({
    where: eq(PaddleSubscriptionsTable.id, subscriptionId),
  });
}
