import { relations } from "drizzle-orm";
import {
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id } from "@/drizzle/schemas/helpers";
import { UsersTable } from "./";

export const userTokenTypeValues = [
  "email_verification",
  "password_reset",
  "device_trust",
  "otp",
  "magic_link",
  "org_invite",
] as const;
export type UserTokenType = (typeof userTokenTypeValues)[number];
export const userTokenTypeEnum = pgEnum("user_token_type", userTokenTypeValues);

export const UserTokensTable = pgTable("user_tokens", {
  id,
  userId: uuid().references(() => UsersTable.id, { onDelete: "cascade" }),
  createdAt,

  tokenHash: text().notNull().unique(),
  type: userTokenTypeEnum().notNull(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  consumedAt: timestamp({ withTimezone: true }),
  metadata: jsonb().$type<Record<string, unknown> | null>().default(null),
});

export const userTokensRelations = relations(UserTokensTable, ({ one }) => ({
  user: one(UsersTable, {
    fields: [UserTokensTable.userId],
    references: [UsersTable.id],
  }),
}));

export type UserToken = typeof UserTokensTable.$inferSelect;
export type NewUserToken = typeof UserTokensTable.$inferInsert;
