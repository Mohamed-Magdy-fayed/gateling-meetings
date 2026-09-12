import {
  listIntegrationMeetings,
  toApiMeeting,
} from "@/features/integrations/server/api-meetings";
import {
  type CreateMeetingBody,
  createMeetingBodySchema,
  listMeetingsQuerySchema,
} from "@/features/integrations/server/api-schemas";
import { ensureLinkedUser } from "@/features/integrations/server/linked-users";
import { findMeetingByCode } from "@/features/meetings/server/queries";
import {
  createInstantMeeting,
  createScheduledMeeting,
} from "@/features/meetings/server/service";
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

async function create(request: Request, { integration, db, t }: ApiContext) {
  const body = await parseJson(request, createMeetingBodySchema);
  const host = await ensureLinkedUser(db, integration, body.host);
  const origin = {
    integrationId: integration.id,
    externalRef: body.externalRef,
  };

  const created = body.scheduledAt
    ? await createScheduledMeeting(
        { db, t },
        {
          hostId: host.id,
          origin,
          settings: body.settings,
          input: scheduledInput(body, body.scheduledAt),
        },
      )
    : await createInstantMeeting(
        { db, t },
        { hostId: host.id, title: body.title, origin, settings: body.settings },
      );

  const meeting = await findMeetingByCode(db, created.code);
  if (!meeting) throw new ApiError(500, "internal_error", "Internal error.");
  return jsonResponse({ meeting: toApiMeeting(meeting) }, { status: 201 });
}

const DEFAULT_DURATION_MINUTES = 60;
const DEFAULT_TIMEZONE = "UTC";

function scheduledInput(body: CreateMeetingBody, scheduledAt: Date) {
  return {
    title: body.title,
    scheduledAt,
    durationMinutes: body.durationMinutes ?? DEFAULT_DURATION_MINUTES,
    timezone: body.timezone ?? DEFAULT_TIMEZONE,
    passcode: body.passcode,
    waitingRoom: body.settings?.waitingRoom ?? true,
    invitees: body.invitees ?? [],
  };
}
