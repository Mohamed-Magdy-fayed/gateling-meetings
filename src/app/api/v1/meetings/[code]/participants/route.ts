import { asc, eq } from "drizzle-orm";

import { LinkedUsersTable, MeetingParticipantsTable } from "@/drizzle/schema";
import { requireIntegrationMeeting } from "@/features/integrations/server/api-meetings";
import { withIntegration } from "@/integrations/api/auth";
import { jsonResponse } from "@/integrations/api/respond";

type Params = { code: string };

/**
 * `GET /api/v1/meetings/:code/participants` — the attendance log, one row
 * per connection, as recorded from LiveKit's webhooks. The role is derived
 * from the identity against the meeting's host, never from anything the
 * client could set. `externalId` is filled in for the host (a linked user);
 * guests who came in through a participant link are anonymous by design.
 */
export const GET = withIntegration<Params>(
  async (_request, { integration, params, db }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
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

    return jsonResponse({
      participants: rows.map((row) => ({
        id: row.id,
        identity: row.identity,
        displayName: row.displayName,
        role: row.userId === meeting.hostId ? "host" : "participant",
        externalId: row.userId
          ? (externalIdByUser.get(row.userId) ?? null)
          : null,
        joinedAt: row.joinedAt.toISOString(),
        leftAt: row.leftAt?.toISOString() ?? null,
      })),
    });
  },
);
