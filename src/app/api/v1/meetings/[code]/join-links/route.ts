import { requireIntegrationMeeting } from "@/features/integrations/server/api-meetings";
import { joinLinkBodySchema } from "@/features/integrations/server/api-schemas";
import { createJoinLink } from "@/features/integrations/server/join-links";
import { parseJson, withIntegration } from "@/integrations/api/auth";
import { jsonResponse } from "@/integrations/api/respond";

type Params = { code: string };

/**
 * `POST /api/v1/meetings/:code/join-links` — a signed, short-lived
 * `/sso/join` URL to redirect a signed-in person to. Host links are
 * single-use and only for the meeting's host; participant links behave
 * like an emailed invite (no passcode, no waiting room).
 */
export const POST = withIntegration<Params>(
  async (request, { integration, params, db }) => {
    const meeting = await requireIntegrationMeeting(
      db,
      integration.id,
      params.code,
    );
    const body = await parseJson(request, joinLinkBodySchema);
    const link = await createJoinLink(db, integration, meeting, body);
    return jsonResponse({ joinLink: link }, { status: 201 });
  },
);
