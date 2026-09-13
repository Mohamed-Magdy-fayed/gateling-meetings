import { eq, or } from "drizzle-orm";

import type { Database } from "@/drizzle";
import { type BillingEventOutcome, OrganizationsTable } from "@/drizzle/schema";
import {
  decideApply,
  type PlanChange,
} from "@/features/billing/server/subscription-mapping";

/**
 * Lands a Paddle-derived change on an org. `FOR UPDATE` serialises two
 * events for the same org that arrive together; `decideApply` keeps a
 * hand-granted plan out of billing's reach and drops out-of-order events.
 * Paddle ids are stored even when the plan is left alone, so the customer
 * portal works for a comped org that once paid.
 */
export async function applyPaddleSubscription(
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
        paddleSyncedAt: OrganizationsTable.paddleSyncedAt,
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
          paddleCustomerId: change.paddleCustomerId,
          paddleSubscriptionId: change.paddleSubscriptionId,
          paddleSubscriptionStatus: change.paddleSubscriptionStatus,
          updatedBy: "paddle",
        })
        .where(eq(OrganizationsTable.id, org.id));
      return decision.reason;
    }

    await trx
      .update(OrganizationsTable)
      .set({ ...change, paddleSyncedAt: occurredAt, updatedBy: "paddle" })
      .where(eq(OrganizationsTable.id, org.id));
    return "applied";
  });
}

/**
 * Which org a Paddle event is about. `custom_data.organizationId` is set
 * server-side when the checkout transaction is created and is the primary
 * key; the Paddle ids are the fallback for events Paddle raises later
 * (renewals, dunning) that may not carry custom data.
 */
export async function findOrganizationForPaddle(
  db: Database,
  hints: {
    organizationId?: string | null;
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
  const clauses = [
    hints.subscriptionId
      ? eq(OrganizationsTable.paddleSubscriptionId, hints.subscriptionId)
      : null,
    hints.customerId
      ? eq(OrganizationsTable.paddleCustomerId, hints.customerId)
      : null,
  ].filter((clause) => clause != null);
  if (clauses.length === 0) return null;
  const match = await db.query.OrganizationsTable.findFirst({
    where: or(...clauses),
    columns: { id: true },
  });
  return match?.id ?? null;
}
