import { relations } from "drizzle-orm";
import { pgTable, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

import {
  createdAt,
  createdBy,
  deletedAt,
  deletedBy,
  id,
  updatedAt,
  updatedBy,
} from "@/drizzle/schemas/helpers";
import {
  BiometricCredentialsTable,
  UserCredentialsTable,
  UserOAuthAccountsTable,
  UserTokensTable,
} from "./";

/**
 * A signed-in account. Only meeting *hosts* need one — guests join a meeting
 * by link with just a display name and never get a row here.
 */
export const UsersTable = pgTable(
  "users",
  {
    id,
    email: varchar({ length: 256 }).notNull(),
    name: varchar({ length: 256 }),
    phone: varchar({ length: 16 }),
    imageUrl: varchar({ length: 512 }),
    emailVerifiedAt: timestamp({ withTimezone: true }),
    lastSignInAt: timestamp({ withTimezone: true }),
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    deletedAt,
    deletedBy,
  },
  (table) => [
    uniqueIndex("users_email_unique").on(table.email),
    uniqueIndex("users_phone_unique").on(table.phone),
  ],
);

export const usersRelations = relations(UsersTable, ({ many, one }) => ({
  credentials: one(UserCredentialsTable, {
    fields: [UsersTable.id],
    references: [UserCredentialsTable.userId],
  }),
  oauthAccounts: many(UserOAuthAccountsTable),
  tokens: many(UserTokensTable),
  biometricCredentials: many(BiometricCredentialsTable),
}));

export type User = typeof UsersTable.$inferSelect;
export type NewUser = typeof UsersTable.$inferInsert;
