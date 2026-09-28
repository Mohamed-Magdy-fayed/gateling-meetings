import { jsonb, pgTable, varchar } from "drizzle-orm/pg-core";

import { updatedAt, updatedBy } from "@/drizzle/schemas/helpers";

/**
 * Platform-wide settings the operator (`ADMIN_EMAILS`) changes at runtime
 * from Settings → Features, one JSON value per key — e.g. `meetingFeatures`.
 * No row means "use the build-time default" for that key.
 */
export const PlatformSettingsTable = pgTable("platform_settings", {
  key: varchar({ length: 64 }).primaryKey(),
  value: jsonb().notNull(),
  updatedAt,
  /** Email of the admin who last changed it. */
  updatedBy,
});
