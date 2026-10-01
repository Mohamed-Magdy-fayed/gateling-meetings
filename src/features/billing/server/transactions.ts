import { and, asc, eq, sql } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  type BillingProviderId,
  type BillingTransaction,
  BillingTransactionsTable,
  type NewBillingTransaction,
  OrganizationMembershipsTable,
  UsersTable,
} from "@/drizzle/schema";

/**
 * Writes a ledger row once per provider transaction. A redelivery (or a
 * re-run of the Inngest step) finds the row already there and returns it
 * unchanged — the first verified report of a transaction is the record.
 */
export async function recordTransaction(
  db: Database,
  values: NewBillingTransaction,
): Promise<BillingTransaction> {
  const [inserted] = await db
    .insert(BillingTransactionsTable)
    .values(values)
    .onConflictDoNothing()
    .returning();
  if (inserted) return inserted;
  const existing = await findTransaction(
    db,
    values.provider ?? "paymob",
    values.providerTransactionId,
  );
  if (!existing) throw new Error("billing transaction not recorded");
  return existing;
}

export async function findTransaction(
  db: Database,
  provider: BillingProviderId,
  providerTransactionId: string,
): Promise<BillingTransaction | null> {
  const row = await db.query.BillingTransactionsTable.findFirst({
    where: and(
      eq(BillingTransactionsTable.provider, provider),
      eq(BillingTransactionsTable.providerTransactionId, providerTransactionId),
    ),
  });
  return row ?? null;
}

/**
 * Marks the original payment as (partly) refunded or voided. The refunded
 * total is capped at the payment amount so a redelivered refund can never
 * push it past what was charged.
 */
export async function applyReversalToPayment(
  db: Database,
  payment: BillingTransaction,
  reversal: { kind: "refund" | "void"; amountCents: number; at: Date },
): Promise<void> {
  if (reversal.kind === "void") {
    await db
      .update(BillingTransactionsTable)
      .set({
        voidedAt: reversal.at,
        refundedAmountCents: payment.amountCents,
      })
      .where(eq(BillingTransactionsTable.id, payment.id));
    return;
  }
  await db
    .update(BillingTransactionsTable)
    .set({
      refundedAmountCents: sql`least(${BillingTransactionsTable.amountCents}, ${BillingTransactionsTable.refundedAmountCents} + ${reversal.amountCents})`,
    })
    .where(eq(BillingTransactionsTable.id, payment.id));
}

/** Ledger rows a billing event produced, oldest first. */
export async function transactionsForEvent(
  db: Database,
  billingEventId: string,
): Promise<BillingTransaction[]> {
  return db.query.BillingTransactionsTable.findMany({
    where: eq(BillingTransactionsTable.billingEventId, billingEventId),
    orderBy: [asc(BillingTransactionsTable.occurredAt)],
  });
}

/** Who gets a receipt when the payment itself does not name anyone. */
export async function organizationOwnerEmail(
  db: Database,
  organizationId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ email: UsersTable.email })
    .from(OrganizationMembershipsTable)
    .innerJoin(
      UsersTable,
      eq(UsersTable.id, OrganizationMembershipsTable.userId),
    )
    .where(
      and(
        eq(OrganizationMembershipsTable.organizationId, organizationId),
        eq(OrganizationMembershipsTable.role, "owner"),
      ),
    )
    .orderBy(asc(OrganizationMembershipsTable.createdAt))
    .limit(1);
  return row?.email ?? null;
}

export async function userEmail(
  db: Database,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const user = await db.query.UsersTable.findFirst({
    where: eq(UsersTable.id, userId),
    columns: { email: true },
  });
  return user?.email ?? null;
}
