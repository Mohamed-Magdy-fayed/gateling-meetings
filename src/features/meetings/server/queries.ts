import { and, eq, isNull } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import { MeetingsTable } from "@/drizzle/schema";

/** Soft-deleted meetings are gone for every caller, including the host. */
export function findMeetingByCode(db: DatabaseOrTransaction, code: string) {
  return db.query.MeetingsTable.findFirst({
    where: and(eq(MeetingsTable.code, code), isNull(MeetingsTable.deletedAt)),
    with: { host: { columns: { id: true, name: true, email: true } } },
  });
}
