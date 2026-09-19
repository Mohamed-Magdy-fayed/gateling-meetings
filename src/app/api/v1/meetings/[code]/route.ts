import {
  requireIntegrationMeeting,
  toApiMeeting,
  updateIntegrationMeeting,
} from "@/features/integrations/server/api-meetings";
import { updateMeetingBodySchema } from "@/features/integrations/server/api-schemas";
import { deleteMeeting } from "@/features/meetings/server/service";
import { parseJson, withIntegration } from "@/integrations/api/auth";
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
export const PATCH = withIntegration<Params>(async (request, ctx) => {
  const meeting = await requireIntegrationMeeting(
    ctx.db,
    ctx.integration.id,
    ctx.params.code,
  );
  const body = await parseJson(request, updateMeetingBodySchema);
  const updated = await updateIntegrationMeeting(ctx, meeting, body);
  return jsonResponse({ meeting: toApiMeeting(updated) });
});

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
