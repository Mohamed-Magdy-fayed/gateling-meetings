import { relations } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { createdAt, updatedAt } from "@/drizzle/schemas/helpers";
import { UsersTable } from "./users-table";

// Google is the only supported OAuth provider in v1 (see 02-dependencies.md / D5).
export const oAuthProviderValues = ["google"] as const;
export type OAuthProvider = (typeof oAuthProviderValues)[number];
export const oAuthProviderEnum = pgEnum("oauth_provider", oAuthProviderValues);

/**
 * Links a user to the Google account they sign in with. Deliberately holds no
 * credentials: the sign-in callback (app/api/oauth/[provider]/route.ts) only
 * ever needs the provider account id to recognize a returning user, and the
 * app makes no Google API calls on a *user's* behalf — the Forms import uses a
 * separate per-organization grant (google_integrations).
 *
 * The `accessToken`/`refreshToken`/`expiresAt`/`scopes` columns this table
 * carried until Phase 7 were never written by any code path, so they were
 * dropped rather than encrypted — storage nothing populates is a trap for a
 * future writer, not a safeguard (STATE.md D124, closing the second half of
 * D64). Anything that later needs per-user Google access should add an
 * encrypted column deliberately, the way google_integrations does.
 */
export const UserOAuthAccountsTable = pgTable(
  "user_oauth_accounts",
  {
    userId: uuid()
      .notNull()
      .references(() => UsersTable.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,

    provider: oAuthProviderEnum().notNull(),
    providerAccountId: text().notNull(),
    displayName: text(),
    profileUrl: text(),
  },
  (t) => [
    primaryKey({ columns: [t.providerAccountId, t.provider] }),
    uniqueIndex("user_oauth_accounts_user_provider_unique").on(
      t.userId,
      t.provider,
    ),
  ],
);

export const userOAuthAccountRelations = relations(
  UserOAuthAccountsTable,
  ({ one }) => ({
    user: one(UsersTable, {
      fields: [UserOAuthAccountsTable.userId],
      references: [UsersTable.id],
    }),
  }),
);

export type UserOAuthAccount = typeof UserOAuthAccountsTable.$inferSelect;
export type NewUserOAuthAccount = typeof UserOAuthAccountsTable.$inferInsert;
