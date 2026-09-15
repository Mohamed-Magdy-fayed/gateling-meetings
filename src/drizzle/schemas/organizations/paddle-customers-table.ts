import { relations } from "drizzle-orm";
import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "@/drizzle/schemas/helpers";
import { OrganizationsTable } from "./organizations-table";

/**
 * Mirror of Paddle's customer entity, keyed by Paddle's own id and written
 * only from verified `customer.*` webhooks (never from the browser). The
 * org link is resolved from `organizations.paddle_customer_id`, which the
 * checkout transaction sets — a customer that never completed a checkout
 * has no org and that is fine.
 *
 * `syncedAt` is the `occurred_at` of the last event applied: an upsert
 * carrying an older instant is a no-op, so out-of-order delivery cannot
 * regress the row.
 */
export const PaddleCustomersTable = pgTable(
  "paddle_customers",
  {
    /** Paddle customer id (`ctm_…`). */
    id: varchar({ length: 64 }).primaryKey(),
    email: varchar({ length: 320 }).notNull(),
    name: varchar({ length: 256 }),
    /** Paddle's `status`: `active` or `archived`. */
    status: varchar({ length: 16 }).notNull(),
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    syncedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("paddle_customers_email_idx").on(table.email),
    index("paddle_customers_org_idx").on(table.organizationId),
  ],
);

export const paddleCustomersRelations = relations(
  PaddleCustomersTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [PaddleCustomersTable.organizationId],
      references: [OrganizationsTable.id],
    }),
  }),
);

export type PaddleCustomer = typeof PaddleCustomersTable.$inferSelect;
export type NewPaddleCustomer = typeof PaddleCustomersTable.$inferInsert;
