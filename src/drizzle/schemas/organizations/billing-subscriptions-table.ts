import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "@/drizzle/schemas/helpers";
import type { BillingProviderId } from "./billing-provider";
import { OrganizationsTable } from "./organizations-table";

/**
 * The app's own status vocabulary. Every provider's states are normalised
 * to these five by its adapter; `subscriptionAccess` only ever reads these.
 */
export const billingSubscriptionStatusValues = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
] as const;
export type BillingSubscriptionStatus =
  (typeof billingSubscriptionStatusValues)[number];

/**
 * Mirror of the provider's subscription entity, keyed by the provider's own
 * id and written only from verified webhooks (or a server-side re-read of
 * the provider's API). This is the raw state — status, seats, period,
 * scheduled change — as the provider last told us; what the org is
 * *entitled to* because of it is derived from here and landed on
 * `organizations` by `applyBillingSubscription`, which is also where a
 * hand-granted plan is protected from billing.
 *
 * `syncedAt` is the instant of the last event applied; older events do not
 * overwrite newer state.
 */
export const BillingSubscriptionsTable = pgTable(
  "billing_subscriptions",
  {
    /** The provider's subscription id. */
    id: varchar({ length: 64 }).primaryKey(),
    provider: varchar({ length: 16 })
      .$type<BillingProviderId>()
      .notNull()
      .default("paymob"),
    /** The provider's customer id, where it has one; Paymob does not. */
    customerId: varchar({ length: 64 }),
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    status: varchar({ length: 32 })
      .$type<BillingSubscriptionStatus>()
      .notNull(),
    /** The provider's own state string, kept for the admin page and debugging. */
    rawStatus: varchar({ length: 32 }),
    /** The catalog plan the subscription is on, as the provider reports it. */
    planId: varchar({ length: 64 }),
    /** Seats. */
    quantity: integer().notNull().default(1),
    /** What the provider charges per cycle, in the smallest unit of `currency`. */
    amountCents: integer(),
    currency: varchar({ length: 3 }),
    currentPeriodStartsAt: timestamp({ withTimezone: true }),
    currentPeriodEndsAt: timestamp({ withTimezone: true }),
    /** A pending cancel/pause/resume; the status is unchanged until `scheduledChangeAt`. */
    scheduledChangeAction: varchar({ length: 32 }),
    scheduledChangeAt: timestamp({ withTimezone: true }),
    canceledAt: timestamp({ withTimezone: true }),
    pausedAt: timestamp({ withTimezone: true }),
    syncedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("billing_subscriptions_customer_idx").on(table.customerId),
    index("billing_subscriptions_org_idx").on(table.organizationId),
  ],
);

export const billingSubscriptionsRelations = relations(
  BillingSubscriptionsTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [BillingSubscriptionsTable.organizationId],
      references: [OrganizationsTable.id],
    }),
  }),
);

export type BillingSubscription = typeof BillingSubscriptionsTable.$inferSelect;
export type NewBillingSubscription =
  typeof BillingSubscriptionsTable.$inferInsert;
