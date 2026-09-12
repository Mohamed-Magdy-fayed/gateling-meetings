import { relations } from "drizzle-orm";
import {
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { UsersTable } from "@/drizzle/schemas/auth";
import { IntegrationsTable } from "./integrations-table";

/**
 * A person from another system, keyed by that system's own id. Mapped to a
 * real `users` row so an integration-made host gets the ordinary host
 * experience (a session, the dashboard, the host controls) with nothing
 * special-cased. One external id maps to exactly one user and vice versa
 * *within* an integration; the same person in two systems is two rows.
 */
export const LinkedUsersTable = pgTable(
  "linked_users",
  {
    integrationId: uuid()
      .notNull()
      .references(() => IntegrationsTable.id, { onDelete: "cascade" }),
    externalId: varchar({ length: 128 }).notNull(),
    userId: uuid()
      .notNull()
      .references(() => UsersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.integrationId, table.externalId] }),
    uniqueIndex("linked_users_integration_user_unique").on(
      table.integrationId,
      table.userId,
    ),
  ],
);

export const linkedUsersRelations = relations(LinkedUsersTable, ({ one }) => ({
  integration: one(IntegrationsTable, {
    fields: [LinkedUsersTable.integrationId],
    references: [IntegrationsTable.id],
  }),
  user: one(UsersTable, {
    fields: [LinkedUsersTable.userId],
    references: [UsersTable.id],
  }),
}));

export type LinkedUser = typeof LinkedUsersTable.$inferSelect;
