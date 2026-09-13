import { and, eq, isNull } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import { MeetingsTable } from "@/drizzle/schema";

/**
 * Soft-deleted meetings are gone for every caller, including the host.
 * Loads the owning org alongside because nearly every caller needs the
 * room's entitlements next (see `entitlementsForMeeting`).
 */
export function findMeetingByCode(db: DatabaseOrTransaction, code: string) {
  return db.query.MeetingsTable.findFirst({
    where: and(eq(MeetingsTable.code, code), isNull(MeetingsTable.deletedAt)),
    with: {
      host: { columns: { id: true, name: true, email: true } },
      organization: true,
    },
  });
}

export function findMeetingById(db: DatabaseOrTransaction, id: string) {
  return db.query.MeetingsTable.findFirst({
    where: and(eq(MeetingsTable.id, id), isNull(MeetingsTable.deletedAt)),
    with: {
      host: { columns: { id: true, name: true, email: true } },
      organization: true,
    },
  });
}
