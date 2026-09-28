import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/drizzle";
import { PlatformSettingsTable } from "@/drizzle/schema";
import {
  type MeetingFeatures,
  resolveMeetingFeatures,
} from "@/features/meetings/lib/meeting-flags";

const KEY = "meetingFeatures";

/**
 * The switches as they apply right now. Never throws: if the table is
 * missing (deploy ahead of `db:migrate`) or the database hiccups, rooms
 * still open with the build-time defaults.
 */
export async function getMeetingFeatures(): Promise<MeetingFeatures> {
  try {
    const row = await db.query.PlatformSettingsTable.findFirst({
      where: eq(PlatformSettingsTable.key, KEY),
    });
    return resolveMeetingFeatures(row?.value);
  } catch (error) {
    console.error("[meeting-features] falling back to defaults", error);
    return resolveMeetingFeatures(undefined);
  }
}

/** Stores the full set (what the admin sees is exactly what applies). */
export async function setMeetingFeatures(
  features: MeetingFeatures,
  updatedBy: string,
) {
  await db
    .insert(PlatformSettingsTable)
    .values({ key: KEY, value: features, updatedBy })
    .onConflictDoUpdate({
      target: PlatformSettingsTable.key,
      set: { value: features, updatedBy, updatedAt: new Date() },
    });
}
