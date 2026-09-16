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

import { UsersTable } from "@/drizzle/schemas/auth";
import { createdAt, id, updatedAt } from "@/drizzle/schemas/helpers";
import type { BillingProviderId } from "./billing-provider";
import { OrganizationsTable, planEnum } from "./organizations-table";

export const billingCheckoutKindValues = ["subscribe", "update_card"] as const;
export type BillingCheckoutKind = (typeof billingCheckoutKindValues)[number];

export const billingCheckoutStatusValues = [
  "open",
  "paid",
  "failed",
  "expired",
] as const;
export type BillingCheckoutStatus =
  (typeof billingCheckoutStatusValues)[number];

/**
 * One row per checkout the app opened, written *before* the provider is
 * asked for a payment page. This is how a provider callback finds its org:
 * the provider echoes back our `reference` (Paymob `special_reference` →
 * `merchant_order_id`) and its own order id, and both point here. Nothing
 * about which org paid is ever taken from the browser or trusted from the
 * callback body alone.
 *
 * `plan`/`interval`/`seats`/`amountCents` are what the buyer agreed to; the
 * initial payment callback applies them to the org so the customer is not
 * waiting on a second, slower webhook to know what was bought.
 */
export const BillingCheckoutsTable = pgTable(
  "billing_checkouts",
  {
    id,
    provider: varchar({ length: 16 })
      .$type<BillingProviderId>()
      .notNull()
      .default("paymob"),
    organizationId: uuid()
      .notNull()
      .references(() => OrganizationsTable.id, { onDelete: "cascade" }),
    createdByUserId: uuid().references(() => UsersTable.id, {
      onDelete: "set null",
    }),
    kind: varchar({ length: 16 })
      .$type<BillingCheckoutKind>()
      .notNull()
      .default("subscribe"),
    status: varchar({ length: 16 })
      .$type<BillingCheckoutStatus>()
      .notNull()
      .default("open"),
    plan: planEnum().notNull(),
    /** `month` | `year`. */
    interval: varchar({ length: 8 }).notNull(),
    seats: integer().notNull().default(1),
    amountCents: integer().notNull(),
    currency: varchar({ length: 3 }).notNull(),
    /** Our `special_reference`; unguessable, unique per checkout. */
    reference: varchar({ length: 64 }).notNull(),
    /** The provider's intention / checkout-session id. */
    providerIntentionId: varchar({ length: 128 }),
    /** The provider's order id, which every later callback carries. */
    providerOrderId: varchar({ length: 64 }),
    /** Filled once the provider tells us which subscription the checkout produced. */
    providerSubscriptionId: varchar({ length: 64 }),
    /** The provider's transaction id of the initial payment, once seen. */
    providerTransactionId: varchar({ length: 64 }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("billing_checkouts_reference_unique").on(table.reference),
    uniqueIndex("billing_checkouts_provider_order_unique").on(
      table.provider,
      table.providerOrderId,
    ),
    index("billing_checkouts_org_idx").on(
      table.organizationId,
      table.createdAt,
    ),
  ],
);

export const billingCheckoutsRelations = relations(
  BillingCheckoutsTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [BillingCheckoutsTable.organizationId],
      references: [OrganizationsTable.id],
    }),
  }),
);

export type BillingCheckout = typeof BillingCheckoutsTable.$inferSelect;
export type NewBillingCheckout = typeof BillingCheckoutsTable.$inferInsert;
