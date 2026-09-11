import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, id } from "@/drizzle/schemas/helpers";
import { MeetingsTable } from "./meetings-table";

export const breakoutStatusValues = ["draft", "open", "closed"] as const;
export type BreakoutStatus = (typeof breakoutStatusValues)[number];
export const breakoutStatusEnum = pgEnum(
  "breakout_status",
  breakoutStatusValues,
);

/**
 * A breakout room is a second LiveKit room (`<code>:b<index>`) that people
 * are *moved* into server-side — no reconnect, no new pre-join. The host
 * drafts rooms and assignments, opens them (everyone assigned is moved),
 * and closes them (everyone is moved back). The main room is never a row
 * here; "return to main" is a move to `<code>`.
 */
export const BreakoutRoomsTable = pgTable(
  "breakout_rooms",
  {
    id,
    meetingId: uuid()
      .notNull()
      .references(() => MeetingsTable.id, { onDelete: "cascade" }),
    index: integer().notNull(),
    name: varchar({ length: 64 }).notNull(),
    liveKitRoomName: varchar({ length: 32 }).notNull(),
    status: breakoutStatusEnum().notNull().default("draft"),
    createdAt,
    openedAt: timestamp({ withTimezone: true }),
    closedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("breakout_rooms_livekit_name_unique").on(table.liveKitRoomName),
    index("breakout_rooms_meeting_idx").on(table.meetingId),
  ],
);

/** Who the host put where. Identity = LiveKit participant identity. */
export const BreakoutAssignmentsTable = pgTable(
  "breakout_assignments",
  {
    breakoutRoomId: uuid()
      .notNull()
      .references(() => BreakoutRoomsTable.id, { onDelete: "cascade" }),
    identity: varchar({ length: 64 }).notNull(),
    displayName: varchar({ length: 64 }).notNull(),
    assignedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.breakoutRoomId, table.identity] })],
);

export const breakoutRoomsRelations = relations(
  BreakoutRoomsTable,
  ({ one, many }) => ({
    meeting: one(MeetingsTable, {
      fields: [BreakoutRoomsTable.meetingId],
      references: [MeetingsTable.id],
    }),
    assignments: many(BreakoutAssignmentsTable),
  }),
);

export const breakoutAssignmentsRelations = relations(
  BreakoutAssignmentsTable,
  ({ one }) => ({
    room: one(BreakoutRoomsTable, {
      fields: [BreakoutAssignmentsTable.breakoutRoomId],
      references: [BreakoutRoomsTable.id],
    }),
  }),
);

export type BreakoutRoom = typeof BreakoutRoomsTable.$inferSelect;
