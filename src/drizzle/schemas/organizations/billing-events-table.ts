import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { id } from "@/drizzle/schemas/helpers";
import type { BillingProviderId } from "./billing-provider";
import { OrganizationsTable } from "./organizations-table";

export const billingEventOutcomeValues = [
  "applied",
  "skipped_manual",
  "skipped_stale",
  "skipped_unhandled",
  "skipped_no_org",
  "error",
] as const;
export type BillingEventOutcome = (typeof billingEventOutcomeValues)[number];

/**
 * Every provider webhook we accepted, keyed by the provider's own event id
 * (or the stable id its adapter derives when the provider has none). The
 * insert is the idempotency claim (a replay hits the unique index and is
 * dropped), and the row is the audit trail of what each event did to
 * which org — durable, unlike the 24-hour Redis store the REST API uses.
 */
export const BillingEventsTable = pgTable(
  "billing_events",
  {
    id,
    provider: varchar({ length: 16 })
      .$type<BillingProviderId>()
      .notNull()
      .default("paymob"),
    providerEventId: varchar({ length: 64 }).notNull(),
    eventType: varchar({ length: 64 }).notNull(),
    occurredAt: timestamp({ withTimezone: true }).notNull(),
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "set null",
    }),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
    outcome: varchar({ length: 32 }).$type<BillingEventOutcome>(),
    error: text(),
  },
  (table) => [
    uniqueIndex("billing_events_provider_event_unique").on(
      table.provider,
      table.providerEventId,
    ),
    index("billing_events_org_idx").on(table.organizationId, table.occurredAt),
  ],
);

export type BillingEvent = typeof BillingEventsTable.$inferSelect;
