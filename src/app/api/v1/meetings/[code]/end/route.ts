import { requireIntegrationMeeting } from "@/features/integrations/server/api-meetings";
import { endMeeting } from "@/features/meetings/server/service";
import { withIntegration } from "@/integrations/api/auth";
import { jsonResponse } from "@/integrations/api/respond";

type Params = { code: string };

/** `POST /api/v1/meetings/:code/end` — "End for all", as the host would. */
export const POST = withIntegration<Params>(
  async (_request, { integration, params, db, t }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
    const result = await endMeeting(
      { db, t },
      meeting,
      `integration:${integration.slug}`,
    );
    return jsonResponse(result);
  },
);
