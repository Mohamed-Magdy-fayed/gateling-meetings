import { sql } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, id, updatedAt, updatedBy } from "@/drizzle/schemas/helpers";
import { OrganizationsTable, planEnum } from "./organizations-table";

/**
 * A plan promised to an email address before (or regardless of) sign-up.
 * Consumed exactly once, by the personal org created for that address on
 * first sign-in — so a partner can be comped before they ever touch the
 * site. Consumed rows stay as the audit trail.
 */
export const PlanGrantsTable = pgTable(
  "plan_grants",
  {
    id,
    /** Stored normalized (see `normalizeEmail`). */
    email: varchar({ length: 256 }).notNull(),
    plan: planEnum().notNull(),
    seatLimit: integer().notNull().default(1),
    expiresAt: timestamp({ withTimezone: true }),
    note: text(),
    /** Email of the admin who created the grant. */
    grantedBy: varchar({ length: 256 }).notNull(),
    consumedAt: timestamp({ withTimezone: true }),
    consumedByOrganizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    createdAt,
    updatedAt,
    updatedBy,
  },
  (table) => [
    index("plan_grants_email_idx").on(table.email),
    // One live grant per address; consumed ones may pile up.
    uniqueIndex("plan_grants_email_pending_unique")
      .on(table.email)
      .where(sql`"consumedAt" IS NULL`),
  ],
);

export type PlanGrant = typeof PlanGrantsTable.$inferSelect;
export type NewPlanGrant = typeof PlanGrantsTable.$inferInsert;
