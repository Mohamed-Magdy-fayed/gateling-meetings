import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/drizzle";
import { MeetingsTable } from "@/drizzle/schema";

/**
 * Used *inside* `step.run` callbacks, never returned from one: Inngest
 * JSON-serialises step results, which turns every `Date` into a string and
 * would silently break the calendar maths downstream.
 */
export function loadMeetingWithHost(meetingId: string) {
  return db.query.MeetingsTable.findFirst({
    where: and(
      eq(MeetingsTable.id, meetingId),
      isNull(MeetingsTable.deletedAt),
    ),
    with: { host: { columns: { name: true, email: true } } },
  });
}
