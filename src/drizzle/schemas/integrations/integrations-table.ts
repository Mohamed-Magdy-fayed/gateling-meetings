import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  createdAt,
  createdBy,
  id,
  updatedAt,
  updatedBy,
} from "@/drizzle/schemas/helpers";
import { OrganizationsTable } from "@/drizzle/schemas/organizations/organizations-table";
import { LinkedUsersTable } from "./linked-users-table";
import { WebhookDeliveriesTable } from "./webhook-deliveries-table";

/**
 * One connected system (atelier, TMS, gateling.com, …). The API key is the
 * only secret that ever leaves this app: it is shown once at creation, and
 * only its SHA-256 is stored — a leaked database cannot call the API.
 * `apiKeyPrefix` (the first characters of the key) is the lookup column, so
 * a request is one indexed read followed by a constant-time hash compare.
 */
export const IntegrationsTable = pgTable(
  "integrations",
  {
    id,
    name: varchar({ length: 128 }).notNull(),
    /** Stable identifier used as the JWT audience and in `createdBy` markers. */
    slug: varchar({ length: 64 }).notNull(),
    /**
     * The org that owns this key and whose plan its API calls run under.
     * Null = a platform integration, minted and seen only by `ADMIN_EMAILS`
     * and never capped.
     */
    organizationId: uuid().references(() => OrganizationsTable.id, {
      onDelete: "cascade",
    }),
    apiKeyPrefix: varchar({ length: 16 }).notNull(),
    apiKeyHash: varchar({ length: 64 }).notNull(),
    /** Where outbound events are POSTed; null = the integration doesn't listen. */
    webhookUrl: varchar({ length: 2048 }),
    /** HMAC key for `X-Meetings-Signature`; issued with the API key. */
    webhookSecret: varchar({ length: 128 }),
    /** Origins a `returnUrl` may point at — nothing else is ever linked to. */
    allowedReturnOrigins: text().array().notNull().default([]),
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    revokedAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("integrations_slug_unique").on(table.slug),
    index("integrations_api_key_prefix_idx").on(table.apiKeyPrefix),
    index("integrations_organization_idx").on(table.organizationId),
  ],
);

export const integrationsRelations = relations(
  IntegrationsTable,
  ({ many, one }) => ({
    organization: one(OrganizationsTable, {
      fields: [IntegrationsTable.organizationId],
      references: [OrganizationsTable.id],
    }),
    linkedUsers: many(LinkedUsersTable),
    webhookDeliveries: many(WebhookDeliveriesTable),
  }),
);

export type Integration = typeof IntegrationsTable.$inferSelect;
export type NewIntegration = typeof IntegrationsTable.$inferInsert;
