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
import { OrganizationsTable } from "./organizations-table";

export const paddleSubscriptionStatusValues = [
  "active",
  "trialing",
  "past_due",
  "paused",
  "canceled",
] as const;
export type PaddleSubscriptionStatus =
  (typeof paddleSubscriptionStatusValues)[number];

/**
 * Mirror of Paddle's subscription entity, keyed by Paddle's own id and
 * written only from verified `subscription.*` webhooks. This is the raw
 * state — status, seats, period, scheduled change — as Paddle last told
 * us; what the org is *entitled to* because of it is derived from here
 * and landed on `organizations` by `applyPaddleSubscription`, which is
 * also where a hand-granted plan is protected from billing.
 *
 * `customerId` is deliberately not a foreign key: `subscription.created`
 * can be delivered before `customer.created`, and a mirror must accept
 * whatever order Paddle sends.
 *
 * `syncedAt` is the `occurred_at` of the last event applied; older events
 * do not overwrite newer state.
 */
export const PaddleSubscriptionsTable = pgTable(
  "paddle_subscriptions",
  {
    /** Paddle subscription id (`sub_…`). */
    id: varchar({ length: 64 }).primaryKey(),
    /** Paddle customer id (`ctm_…`). */
    customerId: varchar({ length: 64 }).notNull(),
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    status: varchar({ length: 32 }).$type<PaddleSubscriptionStatus>().notNull(),
    /** The catalog price and product of the (first) item, as Paddle reports them. */
    priceId: varchar({ length: 64 }),
    productId: varchar({ length: 64 }),
    /** Seats: the quantity on the priced item. */
    quantity: integer().notNull().default(1),
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
    index("paddle_subscriptions_customer_idx").on(table.customerId),
    index("paddle_subscriptions_org_idx").on(table.organizationId),
  ],
);

export const paddleSubscriptionsRelations = relations(
  PaddleSubscriptionsTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [PaddleSubscriptionsTable.organizationId],
      references: [OrganizationsTable.id],
    }),
  }),
);

export type PaddleSubscription = typeof PaddleSubscriptionsTable.$inferSelect;
export type NewPaddleSubscription =
  typeof PaddleSubscriptionsTable.$inferInsert;
