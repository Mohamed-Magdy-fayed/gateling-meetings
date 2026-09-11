import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "@/drizzle/schemas/helpers";
import { UsersTable } from "./";

export const BiometricCredentialsTable = pgTable(
  "biometric_credentials",
  {
    id,
    userId: uuid()
      .notNull()
      .references(() => UsersTable.id, { onDelete: "cascade" }),
    credentialId: text().notNull(),
    publicKey: text().notNull(),
    label: text(),
    transports: jsonb().$type<string[]>(),
    signCount: bigint({ mode: "number" }).notNull().default(0),
    aaguid: text(),
    isBackupEligible: boolean().notNull().default(false),
    isBackupState: boolean().notNull().default(false),
    isUserVerified: boolean().notNull().default(false),
    lastUsedAt: timestamp({ withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    {
      credentialUnique: uniqueIndex(
        "biometric_credentials_credential_unique",
      ).on(table.credentialId),
    },
  ],
);

export const biometricCredentialsRelations = relations(
  BiometricCredentialsTable,
  ({ one }) => ({
    user: one(UsersTable, {
      fields: [BiometricCredentialsTable.userId],
      references: [UsersTable.id],
    }),
  }),
);

export type BiometricCredential = typeof BiometricCredentialsTable.$inferSelect;
export type NewBiometricCredential =
  typeof BiometricCredentialsTable.$inferInsert;
