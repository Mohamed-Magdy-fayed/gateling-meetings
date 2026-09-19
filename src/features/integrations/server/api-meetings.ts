import { and, asc, desc, eq, isNull } from "drizzle-orm";

import { baseUrl } from "@/data/env/server";
import type { Database } from "@/drizzle";
import {
  type Integration,
  LinkedUsersTable,
  type Meeting,
  MeetingParticipantsTable,
  MeetingsTable,
  type Organization,
} from "@/drizzle/schema";
import type { Entitlements } from "@/features/billing/plans";
import { entitlementsForMeeting } from "@/features/billing/server/entitlements";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TFunction } from "@/features/core/i18n/lib";
import { findMeetingByCode } from "@/features/meetings/server/queries";
import {
  createInstantMeeting,
  createScheduledMeeting,
  updateMeeting,
  updateMeetingSettings,
} from "@/features/meetings/server/service";
import { ensurePersonalOrganization } from "@/features/organizations/server/service";
import { meetingNotFound } from "@/integrations/api/respond";
import type { CreateMeetingBody, UpdateMeetingBody } from "./api-schemas";
import { ensureLinkedUser } from "./linked-users";

/**
 * What an integration sees of a meeting. Never the passcode hash or salt;
 * `guestUrl` is the plain share link (passcode + waiting room apply), the
 * SSO links come from `/join-links`.
 */
export function toApiMeeting(meeting: Meeting) {
  return {
    id: meeting.id,
    code: meeting.code,
    title: meeting.title,
    status: meeting.status,
    externalRef: meeting.externalRef,
    scheduledAt: meeting.scheduledAt?.toISOString() ?? null,
    durationMinutes: meeting.durationMinutes,
    timezone: meeting.timezone,
    startedAt: meeting.startedAt?.toISOString() ?? null,
    endedAt: meeting.endedAt?.toISOString() ?? null,
    settings: meeting.settings,
    hasPasscode: meeting.passcodeHash != null,
    guestUrl: `${baseUrl}/m/${meeting.code}`,
    createdAt: meeting.createdAt.toISOString(),
  };
}

export type ApiMeeting = ReturnType<typeof toApiMeeting>;

/** A meeting as `requireIntegrationMeeting` loads it: host and org attached. */
export type IntegrationMeeting = NonNullable<
  Awaited<ReturnType<typeof findMeetingByCode>>
>;

/**
 * Tenancy in one place: a meeting that exists but belongs to someone else
 * is indistinguishable from one that does not exist.
 */
export async function requireIntegrationMeeting(
  db: Database,
  integrationId: string,
  code: string,
) {
  const meeting = await findMeetingByCode(db, code);
  if (!meeting || meeting.integrationId !== integrationId) {
    throw meetingNotFound();
  }
  return meeting;
}

export function listIntegrationMeetings(
  db: Database,
  integrationId: string,
  filters: {
    externalRef?: string;
    status?: Meeting["status"];
    limit: number;
  },
) {
  return db.query.MeetingsTable.findMany({
    where: and(
      eq(MeetingsTable.integrationId, integrationId),
      isNull(MeetingsTable.deletedAt),
      filters.externalRef
        ? eq(MeetingsTable.externalRef, filters.externalRef)
        : undefined,
      filters.status ? eq(MeetingsTable.status, filters.status) : undefined,
    ),
    orderBy: [desc(MeetingsTable.createdAt)],
    limit: filters.limit,
  });
}

/**
 * What every integration-driven write needs: the proven integration, its
 * org (null for a platform key), the org's entitlements, and the `db`/`t`
 * pair the meeting service takes. The REST wrapper and the MCP endpoint
 * both build one of these.
 */
export type IntegrationActor = {
  integration: Integration;
  organization: Organization | null;
  entitlements: Entitlements;
  db: Database;
  t: TFunction<typeof mainTranslations>;
};

const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_TIMEZONE = "UTC";

/**
 * Instant (no `scheduledAt`) or scheduled. The host is a linked user,
 * created on first sight. The meeting runs under the org that owns the
 * key, so the org's plan caps it; a platform integration has no org and is
 * uncapped, its meetings living in the linked host's personal org.
 */
export async function createIntegrationMeeting(
  { integration, organization, entitlements, db, t }: IntegrationActor,
  body: CreateMeetingBody,
) {
  const host = await ensureLinkedUser(db, integration, body.host);
  const origin = {
    integrationId: integration.id,
    externalRef: body.externalRef,
  };
  const owner = {
    hostId: host.id,
    organizationId:
      organization?.id ?? (await ensurePersonalOrganization(db, host)).id,
    entitlements,
  };

  const created = body.scheduledAt
    ? await createScheduledMeeting(
        { db, t },
        {
          ...owner,
          origin,
          settings: body.settings,
          input: {
            title: body.title,
            scheduledAt: body.scheduledAt,
            durationMinutes: body.durationMinutes ?? DEFAULT_DURATION_MINUTES,
            timezone: body.timezone ?? DEFAULT_TIMEZONE,
            passcode: body.passcode,
            waitingRoom: body.settings?.waitingRoom ?? true,
            invitees: body.invitees ?? [],
          },
        },
      )
    : await createInstantMeeting(
        { db, t },
        { ...owner, title: body.title, origin, settings: body.settings },
      );

  return requireIntegrationMeeting(db, integration.id, created.code);
}

/** Title, time, passcode, settings, externalRef — whichever are present. */
export async function updateIntegrationMeeting(
  { integration, db, t }: IntegrationActor,
  meeting: IntegrationMeeting,
  { settings, externalRef, ...fields }: UpdateMeetingBody,
) {
  const actor = `integration:${integration.slug}`;
  await updateMeeting(
    { db, t },
    meeting,
    { ...fields, ...(externalRef !== undefined ? { externalRef } : {}) },
    actor,
    entitlementsForMeeting(meeting),
  );
  if (settings && Object.keys(settings).length > 0) {
    await updateMeetingSettings({ db, t }, meeting, settings, actor);
  }
  return requireIntegrationMeeting(db, integration.id, meeting.code);
}

/**
 * The attendance log, one row per connection, as recorded from LiveKit's
 * webhooks. The role is derived from the identity against the meeting's
 * host, never from anything the client could set. `externalId` is filled
 * in for the host (a linked user); guests who came in through a
 * participant link are anonymous by design.
 */
export async function listMeetingParticipants(
  db: Database,
  integration: Integration,
  meeting: Meeting,
) {
  const [rows, links] = await Promise.all([
    db.query.MeetingParticipantsTable.findMany({
      where: eq(MeetingParticipantsTable.meetingId, meeting.id),
      orderBy: [asc(MeetingParticipantsTable.joinedAt)],
    }),
    db.query.LinkedUsersTable.findMany({
      where: eq(LinkedUsersTable.integrationId, integration.id),
      columns: { userId: true, externalId: true },
    }),
  ]);
  const externalIdByUser = new Map(
    links.map((link) => [link.userId, link.externalId]),
  );
  return rows.map((row) => ({
    id: row.id,
    identity: row.identity,
    displayName: row.displayName,
    role: row.userId === meeting.hostId ? "host" : "participant",
    externalId: row.userId ? (externalIdByUser.get(row.userId) ?? null) : null,
    joinedAt: row.joinedAt.toISOString(),
    leftAt: row.leftAt?.toISOString() ?? null,
  }));
}
