import {
  createIntegrationMeeting,
  listIntegrationMeetings,
  toApiMeeting,
} from "@/features/integrations/server/api-meetings";
import {
  createMeetingBodySchema,
  listMeetingsQuerySchema,
} from "@/features/integrations/server/api-schemas";
import {
  type ApiContext,
  parseJson,
  withIntegration,
} from "@/integrations/api/auth";
import { ApiError } from "@/integrations/api/errors";
import {
  beginIdempotent,
  finishIdempotent,
  IDEMPOTENCY_HEADER,
  idempotencyStoreKey,
  isValidIdempotencyKey,
  REPLAYED_HEADER,
} from "@/integrations/api/idempotency";
import { redisIdempotencyStore } from "@/integrations/api/idempotency-store";
import { jsonResponse } from "@/integrations/api/respond";

/**
 * `GET /api/v1/meetings?externalRef=&status=&limit=` — the integration's
 * own meetings, newest first.
 */
export const GET = withIntegration(async (request, { integration, db }) => {
  const url = new URL(request.url);
  const query = listMeetingsQuerySchema.parse(
    Object.fromEntries(url.searchParams),
  );
  const meetings = await listIntegrationMeetings(db, integration.id, query);
  return jsonResponse({ meetings: meetings.map(toApiMeeting) });
});

/**
 * `POST /api/v1/meetings` — instant (no `scheduledAt`) or scheduled. The
 * host is a linked user, created on first sight. Honours `Idempotency-Key`.
 */
export const POST = withIntegration(async (request, ctx) => {
  const idempotencyKey = request.headers.get(IDEMPOTENCY_HEADER);
  if (idempotencyKey == null) return create(request, ctx);

  if (!isValidIdempotencyKey(idempotencyKey)) {
    throw new ApiError(400, "validation_error", "Invalid Idempotency-Key.");
  }
  const storeKey = idempotencyStoreKey(ctx.integration.id, idempotencyKey);
  const outcome = await beginIdempotent(redisIdempotencyStore, storeKey);
  if (outcome.kind === "replay") {
    return jsonResponse(outcome.response.body, {
      status: outcome.response.status,
      headers: { [REPLAYED_HEADER]: "true" },
    });
  }
  if (outcome.kind === "in-progress") {
    throw new ApiError(
      409,
      "conflict",
      "A request with this Idempotency-Key is still in progress.",
    );
  }

  let response: Response | null = null;
  try {
    response = await create(request, ctx);
    return response;
  } finally {
    await finishIdempotent(
      redisIdempotencyStore,
      storeKey,
      response
        ? { status: response.status, body: await response.clone().json() }
        : null,
    );
  }
});

async function create(request: Request, ctx: ApiContext) {
  const body = await parseJson(request, createMeetingBodySchema);
  // Quota refusals are >= 400 and never cached by the idempotency store,
  // so a retry after an upgrade is not replayed as a failure.
  const meeting = await createIntegrationMeeting(ctx, body);
  return jsonResponse({ meeting: toApiMeeting(meeting) }, { status: 201 });
}
