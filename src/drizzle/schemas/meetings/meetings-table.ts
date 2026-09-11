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
  ],
);

export const meetingsRelations = relations(MeetingsTable, ({ one }) => ({
  host: one(UsersTable, {
    fields: [MeetingsTable.hostId],
    references: [UsersTable.id],
  }),
}));

export type Meeting = typeof MeetingsTable.$inferSelect;
export type NewMeeting = typeof MeetingsTable.$inferInsert;
