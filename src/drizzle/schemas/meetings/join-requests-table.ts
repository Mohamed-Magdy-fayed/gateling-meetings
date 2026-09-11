import { relations } from "drizzle-orm";
import {
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { UsersTable } from "@/drizzle/schemas/auth";
import { createdAt, id } from "@/drizzle/schemas/helpers";
import { MeetingsTable } from "./meetings-table";

export const joinRequestStatusValues = [
  "pending",
  "admitted",
  "denied",
] as const;
export type JoinRequestStatus = (typeof joinRequestStatusValues)[number];
export const joinRequestStatusEnum = pgEnum(
  "join_request_status",
  joinRequestStatusValues,
);

/**
 * The waiting room. A row is created when someone asks to join a meeting
 * whose host wants to admit people by hand; the host's queue is this table
 * filtered to `pending`. Nothing media-related happens until `admitted` —
 * a waiting person holds no LiveKit token and no connection to the SFU.
 *
 * `lastSeenAt` is bumped on every status poll from the waiting browser. A
 * request whose tab was closed stops being bumped and drops out of the
 * host's queue after a few seconds, without a cleanup job.
 */
export const JoinRequestsTable = pgTable(
  "join_requests",
  {
    id,
    meetingId: uuid()
      .notNull()
      .references(() => MeetingsTable.id, { onDelete: "cascade" }),
    /** The LiveKit identity this person will connect with once admitted. */
    identity: varchar({ length: 64 }).notNull(),
    displayName: varchar({ length: 64 }).notNull(),
    userId: uuid().references(() => UsersTable.id, { onDelete: "set null" }),
    status: joinRequestStatusEnum().notNull().default("pending"),
    createdAt,
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index("join_requests_meeting_status_idx").on(table.meetingId, table.status),
  ],
);

export const joinRequestsRelations = relations(
  JoinRequestsTable,
  ({ one }) => ({
    meeting: one(MeetingsTable, {
      fields: [JoinRequestsTable.meetingId],
      references: [MeetingsTable.id],
    }),
  }),
);

export type JoinRequest = typeof JoinRequestsTable.$inferSelect;
