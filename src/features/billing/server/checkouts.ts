import { and, desc, eq, lt } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  type BillingCheckout,
  type BillingCheckoutKind,
  BillingCheckoutsTable,
  type BillingProviderId,
  type PlanId,
} from "@/drizzle/schema";
import type { BillingInterval } from "../catalog";

/** How long a payment page stays valid; matches the provider's `expiration`. */
export const CHECKOUT_TTL_MS = 60 * 60 * 1000;

/** Unguessable, so a callback that only echoes it cannot be forged. */
export function newCheckoutReference(): string {
  return `bc_${crypto.randomUUID().replaceAll("-", "")}`;
}

/**
 * Opens a checkout: the row exists before the provider is asked for a
 * page, so a callback that arrives fast still finds it. The caller fills
 * in the provider's ids once it has them (`bindCheckout`).
 */
export async function openCheckout(
  db: Database,
  input: {
    provider: BillingProviderId;
    organizationId: string;
    createdByUserId: string;
    kind: BillingCheckoutKind;
    plan: PlanId;
    interval: BillingInterval;
    seats: number;
    amountCents: number;
    currency: string;
    providerSubscriptionId?: string | null;
  },
): Promise<BillingCheckout> {
  const [row] = await db
    .insert(BillingCheckoutsTable)
    .values({
      ...input,
      reference: newCheckoutReference(),
      status: "open",
    })
    .returning();
  if (!row) throw new Error("checkout row not inserted");
  return row;
}

export async function bindCheckout(
  db: Database,
  id: string,
  ids: { providerIntentionId: string; providerOrderId: string | null },
): Promise<void> {
  await db
    .update(BillingCheckoutsTable)
    .set(ids)
    .where(eq(BillingCheckoutsTable.id, id));
}

/**
 * Locates the checkout a callback is about. The provider's order id is
 * the strong key (set by us from the provider's own response); our
 * reference is the fallback for providers that echo only that.
 */
export async function findCheckout(
  db: Database,
  provider: BillingProviderId,
  hints: { providerOrderId: string | null; reference: string | null },
): Promise<BillingCheckout | null> {
  if (hints.providerOrderId) {
    const byOrder = await db.query.BillingCheckoutsTable.findFirst({
      where: and(
        eq(BillingCheckoutsTable.provider, provider),
        eq(BillingCheckoutsTable.providerOrderId, hints.providerOrderId),
      ),
    });
    if (byOrder) return byOrder;
  }
  if (hints.reference) {
    const byReference = await db.query.BillingCheckoutsTable.findFirst({
      where: eq(BillingCheckoutsTable.reference, hints.reference),
    });
    if (byReference) return byReference;
  }
  return null;
}

export async function findCheckoutBySubscription(
  db: Database,
  provider: BillingProviderId,
  subscriptionId: string,
): Promise<BillingCheckout | null> {
  const row = await db.query.BillingCheckoutsTable.findFirst({
    where: and(
      eq(BillingCheckoutsTable.provider, provider),
      eq(BillingCheckoutsTable.providerSubscriptionId, subscriptionId),
    ),
    orderBy: [desc(BillingCheckoutsTable.createdAt)],
  });
  return row ?? null;
}

/** The newest paid `subscribe` checkout for an org that has no subscription id yet. */
export async function findUnlinkedPaidCheckout(
  db: Database,
  provider: BillingProviderId,
  organizationId: string,
): Promise<BillingCheckout | null> {
  const rows = await db.query.BillingCheckoutsTable.findMany({
    where: and(
      eq(BillingCheckoutsTable.provider, provider),
      eq(BillingCheckoutsTable.organizationId, organizationId),
      eq(BillingCheckoutsTable.kind, "subscribe"),
      eq(BillingCheckoutsTable.status, "paid"),
    ),
    orderBy: [desc(BillingCheckoutsTable.completedAt)],
    limit: 5,
  });
  return rows.find((row) => !row.providerSubscriptionId) ?? null;
}

export async function completeCheckout(
  db: Database,
  id: string,
  result: {
    status: "paid" | "failed";
    providerTransactionId: string | null;
    completedAt: Date;
  },
): Promise<void> {
  await db
    .update(BillingCheckoutsTable)
    .set(result)
    .where(eq(BillingCheckoutsTable.id, id));
}

export async function linkCheckoutSubscription(
  db: Database,
  id: string,
  providerSubscriptionId: string,
): Promise<void> {
  await db
    .update(BillingCheckoutsTable)
    .set({ providerSubscriptionId })
    .where(eq(BillingCheckoutsTable.id, id));
}

/** Housekeeping: `open` rows older than the TTL are expired, never paid. */
export async function expireStaleCheckouts(
  db: Database,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(BillingCheckoutsTable)
    .set({ status: "expired" })
    .where(
      and(
        eq(BillingCheckoutsTable.status, "open"),
        lt(
          BillingCheckoutsTable.createdAt,
          new Date(now.getTime() - CHECKOUT_TTL_MS),
        ),
      ),
    );
}
