import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, id } from "@/drizzle/schemas/helpers";
import { BillingCheckoutsTable } from "./billing-checkouts-table";
import { BillingEventsTable } from "./billing-events-table";
import type { BillingProviderId } from "./billing-provider";
import { OrganizationsTable } from "./organizations-table";

export const billingTransactionKindValues = [
  "payment",
  "refund",
  "void",
] as const;
export type BillingTransactionKind =
  (typeof billingTransactionKindValues)[number];

export const billingTransactionStatusValues = ["succeeded", "failed"] as const;
export type BillingTransactionStatus =
  (typeof billingTransactionStatusValues)[number];

/**
 * The ledger: one row per money movement the provider reported through a
 * verified callback — every payment attempt, refund and void, keyed by
 * the provider's own transaction id. It is what receipts are sent from,
 * what the admin CSV export reads, and the record kept for the merchant
 * agreement's retention period (5 years), so every foreign key is
 * `set null`: deleting an org, a checkout or an event row never deletes
 * a transaction.
 *
 * Only what a receipt or a reconciliation needs is copied out of the
 * callback (card brand and last four digits, never more); the full
 * callback stays on `billing_events`.
 */
export const BillingTransactionsTable = pgTable(
  "billing_transactions",
  {
    id,
    provider: varchar({ length: 16 })
      .$type<BillingProviderId>()
      .notNull()
      .default("paymob"),
    providerTransactionId: varchar({ length: 64 }).notNull(),
    kind: varchar({ length: 16 }).$type<BillingTransactionKind>().notNull(),
    status: varchar({ length: 16 }).$type<BillingTransactionStatus>().notNull(),
    /** For a refund / void: the provider id of the payment it reverses. */
    parentTransactionId: varchar({ length: 64 }),
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    checkoutId: uuid().references(() => BillingCheckoutsTable.id, {
      onDelete: "set null",
    }),
    billingEventId: uuid().references(() => BillingEventsTable.id, {
      onDelete: "set null",
    }),
    providerOrderId: varchar({ length: 64 }),
    providerSubscriptionId: varchar({ length: 64 }),
    /** Smallest currency unit (piastres for EGP). Always positive. */
    amountCents: integer().notNull(),
    currency: varchar({ length: 3 }).notNull(),
    /** What the payment bought, when known — for the receipt line. */
    plan: varchar({ length: 16 }),
    interval: varchar({ length: 8 }),
    seats: integer(),
    cardBrand: varchar({ length: 32 }),
    cardLast4: varchar({ length: 4 }),
    /** Where the receipt goes; the buyer at checkout, else the org owner. */
    customerEmail: varchar({ length: 256 }),
    /** On a payment: how much of it has been refunded so far. */
    refundedAmountCents: integer().notNull().default(0),
    /** On a payment: when it was voided, if it was. */
    voidedAt: timestamp({ withTimezone: true }),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    receiptSentAt: timestamp({ withTimezone: true }),
    createdAt,
  },
  (table) => [
    uniqueIndex("billing_transactions_provider_txn_unique").on(
      table.provider,
      table.providerTransactionId,
    ),
    index("billing_transactions_org_idx").on(
      table.organizationId,
      table.occurredAt,
    ),
    index("billing_transactions_occurred_idx").on(table.occurredAt),
  ],
);

export const billingTransactionsRelations = relations(
  BillingTransactionsTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [BillingTransactionsTable.organizationId],
      references: [OrganizationsTable.id],
    }),
  }),
);

export type BillingTransaction = typeof BillingTransactionsTable.$inferSelect;
export type NewBillingTransaction =
  typeof BillingTransactionsTable.$inferInsert;
