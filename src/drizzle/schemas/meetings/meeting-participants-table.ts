import { relations } from "drizzle-orm";
import { index, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

import { UsersTable } from "@/drizzle/schemas/auth";
import { id } from "@/drizzle/schemas/helpers";
import { MeetingsTable } from "./meetings-table";

/**
 * Attendance log, written from LiveKit's `participant_joined` /
 * `participant_left` webhooks (never from the client, which could lie).
 * One row per connection: a person who drops and rejoins gets two rows,
 * which is the truth of what happened.
 */
export const MeetingParticipantsTable = pgTable(
  "meeting_participants",
  {
    id,
    meetingId: uuid()
      .notNull()
      .references(() => MeetingsTable.id, { onDelete: "cascade" }),
    identity: varchar({ length: 64 }).notNull(),
    displayName: varchar({ length: 64 }).notNull(),
    userId: uuid().references(() => UsersTable.id, { onDelete: "set null" }),
    role: varchar({ length: 16 }).notNull(),
    joinedAt: timestamp({ withTimezone: true }).notNull(),
    leftAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("meeting_participants_meeting_idx").on(table.meetingId),
    index("meeting_participants_identity_idx").on(
      table.meetingId,
      table.identity,
    ),
  ],
);

export const meetingParticipantsRelations = relations(
  MeetingParticipantsTable,
  ({ one }) => ({
    meeting: one(MeetingsTable, {
      fields: [MeetingParticipantsTable.meetingId],
      references: [MeetingsTable.id],
    }),
  }),
);

export type MeetingParticipant = typeof MeetingParticipantsTable.$inferSelect;
