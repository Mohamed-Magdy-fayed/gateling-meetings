import { relations } from "drizzle-orm";
import {
  boolean,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "@/drizzle/schemas/helpers";
import { UsersTable } from "./users-table";

export const UserCredentialsTable = pgTable(
  "user_credentials",
  {
    userId: uuid()
      .notNull()
      .references(() => UsersTable.id, { onDelete: "cascade" }),
    passwordHash: text().notNull(),
    passwordSalt: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }),
    mustChangePassword: boolean().notNull().default(false),
    lastChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    createdAt,
    updatedAt,
  },
  (table) => [uniqueIndex("user_credentials_user_id_unique").on(table.userId)],
);

export const userCredentialsRelations = relations(
  UserCredentialsTable,
  ({ one }) => ({
    user: one(UsersTable, {
      fields: [UserCredentialsTable.userId],
      references: [UsersTable.id],
    }),
  }),
);

export type UserCredentials = typeof UserCredentialsTable.$inferSelect;
export type NewUserCredentials = typeof UserCredentialsTable.$inferInsert;
