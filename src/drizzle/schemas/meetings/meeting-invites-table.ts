import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { createdAt, id } from "@/drizzle/schemas/helpers";
import { MeetingsTable } from "./meetings-table";

/**
 * One row per emailed invitation. `token` goes into the invite link
 * (`/m/<code>?invite=<token>`) and is the invitee's credential: it skips the
 * passcode and the waiting room, because the host addressed this person by
 * name. Tokens are random and unguessable; nothing else is stored about the
 * recipient.
 */
export const MeetingInvitesTable = pgTable(
  "meeting_invites",
  {
    id,
    meetingId: uuid()
      .notNull()
      .references(() => MeetingsTable.id, { onDelete: "cascade" }),
    email: varchar({ length: 256 }).notNull(),
    name: varchar({ length: 128 }),
    token: varchar({ length: 64 }).notNull(),
    createdAt,
    sentAt: timestamp({ withTimezone: true }),
    /** Bumped when a reminder goes out so a re-run never double-sends. */
    remindedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    uniqueIndex("meeting_invites_token_unique").on(table.token),
    uniqueIndex("meeting_invites_meeting_email_unique").on(
      table.meetingId,
      table.email,
    ),
    index("meeting_invites_meeting_idx").on(table.meetingId),
  ],
);

export const meetingInvitesRelations = relations(
  MeetingInvitesTable,
  ({ one }) => ({
    meeting: one(MeetingsTable, {
      fields: [MeetingInvitesTable.meetingId],
      references: [MeetingsTable.id],
    }),
  }),
);

export type MeetingInvite = typeof MeetingInvitesTable.$inferSelect;
