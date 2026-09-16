import { eq, lte } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  BillingCustomersTable,
  type BillingProviderId,
  type BillingSubscription,
  BillingSubscriptionsTable,
} from "@/drizzle/schema";
import {
  type CustomerFacts,
  type SubscriptionFacts,
  toDate,
} from "./subscription-mapping";

/**
 * Upserts keyed on the provider's ids, so a redelivered event is a no-op
 * and an update that overtakes its create is not undone when the older one
 * finally lands: the row only moves forward in `syncedAt`.
 */
export async function upsertBillingCustomer(
  db: Database,
  provider: BillingProviderId,
  facts: CustomerFacts,
  organizationId: string | null,
  occurredAt: Date,
): Promise<void> {
  const values = {
    provider,
    email: facts.email,
    name: facts.name,
    status: facts.status,
    organizationId,
    cardToken: facts.card?.token ?? null,
    maskedPan: facts.card?.maskedPan ?? null,
    cardBrand: facts.card?.brand ?? null,
    syncedAt: occurredAt,
  };
  await db
    .insert(BillingCustomersTable)
    .values({ id: facts.id, ...values })
    .onConflictDoUpdate({
      target: BillingCustomersTable.id,
      set: values,
      setWhere: lte(BillingCustomersTable.syncedAt, occurredAt),
    });
}

export async function upsertBillingSubscription(
  db: Database,
  provider: BillingProviderId,
  facts: SubscriptionFacts,
  organizationId: string | null,
  occurredAt: Date,
): Promise<void> {
  const values = {
    provider,
    customerId: facts.customerId,
    organizationId,
    status: facts.status,
    rawStatus: facts.rawStatus,
    planId: facts.planId,
    quantity: Math.max(1, facts.quantity ?? 1),
    amountCents: facts.amountCents,
    currency: facts.currency,
    currentPeriodStartsAt: toDate(facts.currentBillingPeriod?.startsAt),
    currentPeriodEndsAt: toDate(facts.currentBillingPeriod?.endsAt),
    scheduledChangeAction: facts.scheduledChange?.action ?? null,
    scheduledChangeAt: toDate(facts.scheduledChange?.effectiveAt),
    canceledAt: toDate(facts.canceledAt),
    pausedAt: toDate(facts.pausedAt),
    syncedAt: occurredAt,
  };
  await db
    .insert(BillingSubscriptionsTable)
    .values({ id: facts.id, ...values })
    .onConflictDoUpdate({
      target: BillingSubscriptionsTable.id,
      set: values,
      setWhere: lte(BillingSubscriptionsTable.syncedAt, occurredAt),
    });
}

/** The mirrored subscription an org is on, for the billing summary. */
export async function findMirroredSubscription(
  db: Database,
  subscriptionId: string,
) {
  return db.query.BillingSubscriptionsTable.findFirst({
    where: eq(BillingSubscriptionsTable.id, subscriptionId),
  });
}

/** The saved card an org's charges run on, newest first. */
export async function findBillingCard(db: Database, organizationId: string) {
  return db.query.BillingCustomersTable.findFirst({
    where: eq(BillingCustomersTable.organizationId, organizationId),
    orderBy: (table, { desc }) => [desc(table.syncedAt)],
  });
}

/**
 * The mirror row as facts, for when the provider cannot be re-read (or
 * says nothing new) and the app still has to act on a payment result.
 */
export function factsFromMirror(row: BillingSubscription): SubscriptionFacts {
  return {
    id: row.id,
    customerId: row.customerId,
    status: row.status,
    rawStatus: row.rawStatus,
    planId: row.planId,
    quantity: null,
    amountCents: row.amountCents,
    currency: row.currency,
    currentBillingPeriod: row.currentPeriodEndsAt
      ? {
          startsAt: row.currentPeriodStartsAt?.toISOString() ?? null,
          endsAt: row.currentPeriodEndsAt.toISOString(),
        }
      : null,
    scheduledChange:
      row.scheduledChangeAction && row.scheduledChangeAt
        ? {
            action: row.scheduledChangeAction,
            effectiveAt: row.scheduledChangeAt.toISOString(),
          }
        : null,
    canceledAt: row.canceledAt?.toISOString() ?? null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
  };
}
