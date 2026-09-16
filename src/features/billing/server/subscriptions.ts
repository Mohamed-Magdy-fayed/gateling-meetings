import { and, eq, or } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  BillingCheckoutsTable,
  type BillingEventOutcome,
  type BillingProviderId,
  OrganizationsTable,
} from "@/drizzle/schema";
import {
  decideApply,
  type PlanChange,
} from "@/features/billing/server/subscription-mapping";

/**
 * Lands a billing-derived change on an org. `FOR UPDATE` serialises two
 * events for the same org that arrive together; `decideApply` keeps a
 * hand-granted plan out of billing's reach and drops out-of-order events.
 * Provider ids are stored even when the plan is left alone, so card
 * updates and invoices work for a comped org that once paid.
 */
export async function applyBillingSubscription(
  db: Database,
  organizationId: string,
  change: PlanChange,
  occurredAt: Date,
): Promise<
  Extract<BillingEventOutcome, "applied" | "skipped_manual" | "skipped_stale">
> {
  return db.transaction(async (trx) => {
    const [org] = await trx
      .select({
        id: OrganizationsTable.id,
        planSource: OrganizationsTable.planSource,
        billingSyncedAt: OrganizationsTable.billingSyncedAt,
      })
      .from(OrganizationsTable)
      .where(eq(OrganizationsTable.id, organizationId))
      .for("update");
    if (!org) throw new Error(`organization ${organizationId} not found`);

    const decision = decideApply(org, occurredAt);
    if (!decision.apply) {
      await trx
        .update(OrganizationsTable)
        .set({
          billingCustomerId: change.billingCustomerId,
          billingSubscriptionId: change.billingSubscriptionId,
          billingSubscriptionStatus: change.billingSubscriptionStatus,
          updatedBy: "billing",
        })
        .where(eq(OrganizationsTable.id, org.id));
      return decision.reason;
    }

    await trx
      .update(OrganizationsTable)
      .set({ ...change, billingSyncedAt: occurredAt, updatedBy: "billing" })
      .where(eq(OrganizationsTable.id, org.id));
    return "applied";
  });
}

/**
 * Which org a billing event is about. The checkout row (matched by the
 * provider's order id or our own reference, both set server-side when the
 * checkout was opened) is the primary key; the provider's subscription /
 * customer ids on the org are the fallback for events the provider raises
 * later (renewals, dunning) that carry neither.
 */
export async function findOrganizationForBilling(
  db: Database,
  provider: BillingProviderId,
  hints: {
    organizationId?: string | null;
    providerOrderId?: string | null;
    reference?: string | null;
    subscriptionId?: string | null;
    customerId?: string | null;
  },
): Promise<string | null> {
  if (hints.organizationId) {
    const byId = await db.query.OrganizationsTable.findFirst({
      where: eq(OrganizationsTable.id, hints.organizationId),
      columns: { id: true },
    });
    if (byId) return byId.id;
  }

  const checkoutClauses = [
    hints.providerOrderId
      ? and(
          eq(BillingCheckoutsTable.provider, provider),
          eq(BillingCheckoutsTable.providerOrderId, hints.providerOrderId),
        )
      : null,
    hints.reference
      ? eq(BillingCheckoutsTable.reference, hints.reference)
      : null,
    hints.subscriptionId
      ? and(
          eq(BillingCheckoutsTable.provider, provider),
          eq(
            BillingCheckoutsTable.providerSubscriptionId,
            hints.subscriptionId,
          ),
        )
      : null,
  ].filter((clause) => clause != null);
  if (checkoutClauses.length > 0) {
    const checkout = await db.query.BillingCheckoutsTable.findFirst({
      where: or(...checkoutClauses),
      columns: { organizationId: true },
    });
    if (checkout) return checkout.organizationId;
  }

  const orgClauses = [
    hints.subscriptionId
      ? eq(OrganizationsTable.billingSubscriptionId, hints.subscriptionId)
      : null,
    hints.customerId
      ? eq(OrganizationsTable.billingCustomerId, hints.customerId)
      : null,
  ].filter((clause) => clause != null);
  if (orgClauses.length === 0) return null;
  const match = await db.query.OrganizationsTable.findFirst({
    where: or(...orgClauses),
    columns: { id: true },
  });
  return match?.id ?? null;
}
