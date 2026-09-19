import { createMcpHandler } from "@modelcontextprotocol/server";

import { getT } from "@/features/core/i18n/server";
import type { IntegrationActor } from "@/features/integrations/server/api-meetings";
import { buildMcpServer } from "@/features/integrations/server/mcp-server";
import { resolveIntegrationRequest, toApiError } from "@/integrations/api/auth";
import { errorResponse } from "@/integrations/api/respond";

export const runtime = "nodejs";

/**
 * `/api/mcp` — the Model Context Protocol endpoint (Streamable HTTP,
 * stateless). Authenticated exactly like `/api/v1`: `Authorization: Bearer
 * gm_live_…`, the same rate limits and the same plan gate, so a key that
 * works for the REST API works here and one that is revoked or lapsed does
 * not. The proven integration rides into the per-request server factory
 * on `authInfo`; the SDK never derives auth from headers itself.
 */
const actors = new WeakMap<object, IntegrationActor>();

const handler = createMcpHandler(
  ({ authInfo }) => {
    const actor = authInfo?.extra ? actors.get(authInfo.extra) : undefined;
    if (!actor) throw new Error("MCP request without a resolved integration.");
    return buildMcpServer(actor);
  },
  { onerror: (error) => console.error("[api/mcp]", error) },
);

async function serve(request: Request): Promise<Response> {
  const { t } = await getT();
  let actor: IntegrationActor;
  try {
    actor = await resolveIntegrationRequest(request, t);
  } catch (error) {
    return errorResponse(toApiError(error, t));
  }
  // `extra` is the SDK's bag for caller data; keep the actor out of the
  // serialisable surface and hand over an opaque key instead.
  const extra = {};
  actors.set(extra, actor);
  return handler.fetch(request, {
    authInfo: {
      token: "",
      clientId: actor.integration.slug,
      scopes: ["meetings"],
      extra,
    },
  });
}

export { serve as GET, serve as POST, serve as DELETE };
