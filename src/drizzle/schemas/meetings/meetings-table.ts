import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { UsersTable } from "@/drizzle/schemas/auth";
import {
  createdAt,
  createdBy,
  deletedAt,
  deletedBy,
  id,
  updatedAt,
  updatedBy,
} from "@/drizzle/schemas/helpers";
import { IntegrationsTable } from "@/drizzle/schemas/integrations/integrations-table";
import { BreakoutRoomsTable } from "./breakout-rooms-table";
import { JoinRequestsTable } from "./join-requests-table";
import { MeetingInvitesTable } from "./meeting-invites-table";
import { MeetingParticipantsTable } from "./meeting-participants-table";
import {
  DEFAULT_MEETING_SETTINGS,
  type MeetingSettings,
} from "./meeting-settings";

export const meetingStatusValues = ["scheduled", "live", "ended"] as const;
export type MeetingStatus = (typeof meetingStatusValues)[number];
export const meetingStatusEnum = pgEnum("meeting_status", meetingStatusValues);

/**
 * One meeting = one LiveKit room, named by `code`. The code is what people
 * type or click (`/m/abc-defg-hij`), so it is the room name too — there is
 * no second identifier to keep in sync. A personal room is a meeting whose
 * code never rotates; an instant meeting is `live` from the moment it is
 * created; a scheduled one starts `scheduled` and flips to `live` when the
 * host arrives.
 */
export const MeetingsTable = pgTable(
  "meetings",
  {
    id,
    hostId: uuid()
      .notNull()
      .references(() => UsersTable.id, { onDelete: "cascade" }),
    code: varchar({ length: 12 }).notNull(),
    title: varchar({ length: 200 }).notNull(),
    // Hashed like a password — a leaked database must not leak room passcodes.
    passcodeHash: varchar({ length: 256 }),
    passcodeSalt: varchar({ length: 64 }),
    isPersonalRoom: boolean().notNull().default(false),
    scheduledAt: timestamp({ withTimezone: true }),
    durationMinutes: integer(),
    timezone: varchar({ length: 64 }),
    status: meetingStatusEnum().notNull().default("scheduled"),
    startedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    settings: jsonb()
      .$type<MeetingSettings>()
      .notNull()
      .default(DEFAULT_MEETING_SETTINGS),
    /**
     * Set when another system created this meeting through the API. Tenancy
     * hangs off this: an integration only ever sees meetings carrying its id.
     */
    integrationId: uuid().references(() => IntegrationsTable.id, {
      onDelete: "set null",
    }),
    /** The other system's own handle for this meeting (e.g. `order:8812`). */
    externalRef: varchar({ length: 128 }),
    createdAt,
    createdBy,
    updatedAt,
    updatedBy,
    deletedAt,
    deletedBy,
  },
  (table) => [
    uniqueIndex("meetings_code_unique").on(table.code),
    index("meetings_host_idx").on(table.hostId),
    index("meetings_scheduled_at_idx").on(table.scheduledAt),
    index("meetings_integration_external_ref_idx").on(
      table.integrationId,
      table.externalRef,
    ),
  ],
);

export const meetingsRelations = relations(MeetingsTable, ({ one, many }) => ({
  host: one(UsersTable, {
    fields: [MeetingsTable.hostId],
    references: [UsersTable.id],
  }),
  integration: one(IntegrationsTable, {
    fields: [MeetingsTable.integrationId],
    references: [IntegrationsTable.id],
  }),
  joinRequests: many(JoinRequestsTable),
  participants: many(MeetingParticipantsTable),
}));

export type Meeting = typeof MeetingsTable.$inferSelect;
export type NewMeeting = typeof MeetingsTable.$inferInsert;
