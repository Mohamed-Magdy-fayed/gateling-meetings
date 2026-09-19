import {
  listMeetingParticipants,
  requireIntegrationMeeting,
} from "@/features/integrations/server/api-meetings";
import { withIntegration } from "@/integrations/api/auth";
import { jsonResponse } from "@/integrations/api/respond";

type Params = { code: string };

/** `GET /api/v1/meetings/:code/participants` — see `listMeetingParticipants`. */
export const GET = withIntegration<Params>(
  async (_request, { integration, params, db }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
    return jsonResponse({
      participants: await listMeetingParticipants(db, integration, meeting),
    });
  },
);
