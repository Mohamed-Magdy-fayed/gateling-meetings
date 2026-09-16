import { relations } from "drizzle-orm";
import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "@/drizzle/schemas/helpers";
import type { BillingProviderId } from "./billing-provider";
import { OrganizationsTable } from "./organizations-table";

/**
 * Who pays, as the provider knows them, keyed by the provider's own id and
 * written only from verified webhooks. For a provider with a customer
 * entity this mirrors it; for Paymob — which has none — a row is the
 * tokenised card the recurring deductions run against (`TOKEN` callback),
 * so the billing page can say "Visa •••• 2346" without ever holding a PAN.
 *
 * `syncedAt` is the instant of the last event applied: an upsert carrying
 * an older instant is a no-op, so out-of-order delivery cannot regress the
 * row.
 */
export const BillingCustomersTable = pgTable(
  "billing_customers",
  {
    /** The provider's customer id, or its card-token id for Paymob. */
    id: varchar({ length: 64 }).primaryKey(),
    provider: varchar({ length: 16 })
      .$type<BillingProviderId>()
      .notNull()
      .default("paymob"),
    email: varchar({ length: 320 }).notNull(),
    name: varchar({ length: 256 }),
    /** `active` or `archived`. */
    status: varchar({ length: 16 }).notNull(),
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    /** The saved-card token the provider charges (opaque; never a PAN). */
    cardToken: varchar({ length: 128 }),
    /** `xxxx-xxxx-xxxx-2346` as the provider masks it. */
    maskedPan: varchar({ length: 32 }),
    /** `Visa`, `MasterCard`, … */
    cardBrand: varchar({ length: 32 }),
    syncedAt: timestamp({ withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("billing_customers_email_idx").on(table.email),
    index("billing_customers_org_idx").on(table.organizationId),
  ],
);

export const billingCustomersRelations = relations(
  BillingCustomersTable,
  ({ one }) => ({
    organization: one(OrganizationsTable, {
      fields: [BillingCustomersTable.organizationId],
      references: [OrganizationsTable.id],
    }),
  }),
);

export type BillingCustomer = typeof BillingCustomersTable.$inferSelect;
export type NewBillingCustomer = typeof BillingCustomersTable.$inferInsert;
