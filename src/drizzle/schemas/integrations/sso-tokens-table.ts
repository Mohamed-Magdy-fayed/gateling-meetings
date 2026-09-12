import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { MeetingsTable } from "@/drizzle/schemas/meetings/meetings-table";
import { IntegrationsTable } from "./integrations-table";

export const ssoRoleValues = ["host", "participant"] as const;
export type SsoRole = (typeof ssoRoleValues)[number];

/**
 * One row per minted `/sso/join` link. A *host* link signs the person in, so
 * it is single-use: `usedAt` is set atomically on first redemption and a
 * replay lands on `/sso/error?reason=used`. A *participant* link is an
 * invite — reusable until `expiresAt`, like an emailed one — and the row is
 * only an audit trail. The JWT itself carries the claims; this table only
 * answers "was it spent?".
 */
export const SsoTokensTable = pgTable(
  "sso_tokens",
  {
    jti: varchar({ length: 64 }).primaryKey(),
    integrationId: uuid()
      .notNull()
      .references(() => IntegrationsTable.id, { onDelete: "cascade" }),
    meetingId: uuid()
      .notNull()
      .references(() => MeetingsTable.id, { onDelete: "cascade" }),
    role: varchar({ length: 16 }).$type<SsoRole>().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("sso_tokens_meeting_idx").on(table.meetingId),
    index("sso_tokens_expires_at_idx").on(table.expiresAt),
  ],
);

export type SsoToken = typeof SsoTokensTable.$inferSelect;
