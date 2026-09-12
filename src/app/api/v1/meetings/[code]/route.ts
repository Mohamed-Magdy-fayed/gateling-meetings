import {
  requireIntegrationMeeting,
  toApiMeeting,
} from "@/features/integrations/server/api-meetings";
import { updateMeetingBodySchema } from "@/features/integrations/server/api-schemas";
import { findMeetingByCode } from "@/features/meetings/server/queries";
import {
  deleteMeeting,
  updateMeeting,
  updateMeetingSettings,
} from "@/features/meetings/server/service";
import { parseJson, withIntegration } from "@/integrations/api/auth";
import { ApiError } from "@/integrations/api/errors";
import { jsonResponse } from "@/integrations/api/respond";

type Params = { code: string };

/** `GET /api/v1/meetings/:code` */
export const GET = withIntegration<Params>(
  async (_request, { integration, params, db }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
    return jsonResponse({ meeting: toApiMeeting(meeting) });
  },
);

/** `PATCH /api/v1/meetings/:code` — title, time, passcode, settings, externalRef. */
export const PATCH = withIntegration<Params>(
  async (request, { integration, params, db, t }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
    const { settings, externalRef, ...fields } = await parseJson(
      request,
      updateMeetingBodySchema,
    );
    const actor = `integration:${integration.slug}`;

    await updateMeeting(
      { db, t },
      meeting,
      {
        ...fields,
        ...(externalRef !== undefined ? { externalRef } : {}),
      },
      actor,
    );
    if (settings && Object.keys(settings).length > 0) {
      await updateMeetingSettings({ db, t }, meeting, settings, actor);
    }

    const updated = await findMeetingByCode(db, meeting.code);
    if (!updated) throw new ApiError(500, "internal_error", "Internal error.");
    return jsonResponse({ meeting: toApiMeeting(updated) });
  },
);

/** `DELETE /api/v1/meetings/:code` — soft delete; the link stops resolving. */
export const DELETE = withIntegration<Params>(
  async (_request, { integration, params, db, t }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
    await deleteMeeting({ db, t }, meeting, `integration:${integration.slug}`);
    return new Response(null, { status: 204 });
  },
);
