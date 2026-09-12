import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { id } from "@/drizzle/schemas/helpers";
import { IntegrationsTable } from "./integrations-table";

export const webhookDeliveryStatusValues = [
  "pending",
  "delivered",
  "failed",
] as const;
export type WebhookDeliveryStatus =
  (typeof webhookDeliveryStatusValues)[number];
export const webhookDeliveryStatusEnum = pgEnum(
  "webhook_delivery_status",
  webhookDeliveryStatusValues,
);

export const webhookEventValues = [
  "meeting.started",
  "meeting.ended",
  "participant.joined",
  "participant.left",
] as const;
export type WebhookEvent = (typeof webhookEventValues)[number];

/**
 * One row per outbound webhook. The row is written first and the Inngest
 * delivery is triggered second, so a delivery that never leaves (Inngest
 * down, endpoint dead for a day) is still visible on the admin page rather
 * than silently gone. `id` doubles as the payload's `id`, which is what the
 * receiver should deduplicate on.
 */
export const WebhookDeliveriesTable = pgTable(
  "webhook_deliveries",
  {
    id,
    integrationId: uuid()
      .notNull()
      .references(() => IntegrationsTable.id, { onDelete: "cascade" }),
    event: varchar({ length: 64 }).$type<WebhookEvent>().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatusEnum().notNull().default("pending"),
    attempts: integer().notNull().default(0),
    lastError: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("webhook_deliveries_integration_idx").on(
      table.integrationId,
      table.createdAt,
    ),
  ],
);

export const webhookDeliveriesRelations = relations(
  WebhookDeliveriesTable,
  ({ one }) => ({
    integration: one(IntegrationsTable, {
      fields: [WebhookDeliveriesTable.integrationId],
      references: [IntegrationsTable.id],
    }),
  }),
);

export type WebhookDelivery = typeof WebhookDeliveriesTable.$inferSelect;
