import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { ZodError, z } from "zod";

import { db } from "@/drizzle";
import { type Integration, IntegrationsTable } from "@/drizzle/schema";
import type { mainTranslations } from "@/features/core/i18n/global";
import type { TFunction } from "@/features/core/i18n/lib";
import { getT } from "@/features/core/i18n/server";
import {
  integrationApiRatelimit,
  isRateLimited,
} from "@/integrations/ratelimit";
import { ApiError, apiErrorFromTrpcCode } from "./errors";
import { apiKeyPrefix, isWellFormedApiKey, verifyApiKey } from "./keys";
import { errorResponse } from "./respond";

/**
 * Everything a `/api/v1` handler gets: the proven integration, the route
 * params, and the same `db`/`t` pair the service layer takes.
 */
export type ApiContext<P = Record<string, never>> = {
  integration: Integration;
  params: P;
  db: typeof db;
  t: TFunction<typeof mainTranslations>;
};

type Handler<P> = (request: Request, ctx: ApiContext<P>) => Promise<Response>;

type RouteContext<P> = { params: Promise<P> };

/** `lastUsedAt` is informational; one write a minute per key is plenty. */
const LAST_USED_WRITE_INTERVAL_MS = 60_000;

/**
 * Bearer auth, per-key rate limit, JSON error envelope. The handler only
 * ever runs with a live integration in hand, and anything it throws —
 * `ApiError`, a `TRPCError` from the service layer, a `ZodError` from
 * `parseJson` — comes out as the fixed envelope. Unknown errors are a 500
 * with a fixed message; the details go to the log, not to the caller.
 */
export function withIntegration<P = Record<string, never>>(
  handler: Handler<P>,
) {
  return async (request: Request, route: RouteContext<P>) => {
    const { t } = await getT();
    try {
      const integration = await authenticate(request);
      if (await isRateLimited(integrationApiRatelimit, integration.id)) {
        throw new ApiError(429, "rate_limited", "Too many requests.");
      }
      const params = await route.params;
      return await handler(request, { integration, params, db, t });
    } catch (error) {
      return errorResponse(toApiError(error, t));
    }
  };
}

async function authenticate(request: Request): Promise<Integration> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, key] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !key || !isWellFormedApiKey(key)) {
    throw new ApiError(401, "unauthorized", "Missing or malformed API key.");
  }

  const integration = await db.query.IntegrationsTable.findFirst({
    where: eq(IntegrationsTable.apiKeyPrefix, apiKeyPrefix(key)),
  });
  // Same error whether the prefix is unknown, the hash mismatches or the key
  // was revoked: a caller cannot learn which by probing.
  if (
    !integration ||
    integration.revokedAt != null ||
    !verifyApiKey(key, integration.apiKeyHash)
  ) {
    throw new ApiError(401, "unauthorized", "Invalid API key.");
  }

  await db
    .update(IntegrationsTable)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(IntegrationsTable.id, integration.id),
        or(
          isNull(IntegrationsTable.lastUsedAt),
          lt(
            IntegrationsTable.lastUsedAt,
            new Date(Date.now() - LAST_USED_WRITE_INTERVAL_MS),
          ),
        ),
      ),
    );

  return integration;
}

function toApiError(
  error: unknown,
  t: TFunction<typeof mainTranslations>,
): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof ZodError) {
    return new ApiError(
      400,
      "validation_error",
      "Invalid request body.",
      translateIssueTree(z.treeifyError(error), t),
    );
  }
  if (error instanceof TRPCError) {
    const mapped = apiErrorFromTrpcCode(error.code, error.message);
    if (mapped.status === 500) console.error("[api/v1]", error);
    return mapped;
  }
  console.error("[api/v1]", error);
  return new ApiError(500, "internal_error", "Internal error.");
}

/**
 * The shared zod schemas carry translation *keys* as messages (the forms
 * translate them on render). Walk the tree and translate for the API too —
 * `t` returns the key unchanged when it isn't one, so plain messages pass through.
 */
function translateIssueTree(
  node: unknown,
  t: TFunction<typeof mainTranslations>,
): unknown {
  if (Array.isArray(node))
    return node.map((item) => translateIssueTree(item, t));
  if (typeof node === "string") return t(node as never);
  if (node && typeof node === "object") {
    return Object.fromEntries(
      Object.entries(node).map(([key, value]) => [
        key,
        translateIssueTree(value, t),
      ]),
    );
  }
  return node;
}

const MAX_BODY_BYTES = 64 * 1024;

/** Reads and validates a JSON body; a missing body is treated as `{}`. */
export async function parseJson<S extends z.ZodType>(
  request: Request,
  schema: S,
): Promise<z.infer<S>> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new ApiError(413, "validation_error", "Request body too large.");
  }
  let raw: unknown = {};
  if (text.trim().length > 0) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, "validation_error", "Body is not valid JSON.");
    }
  }
  return schema.parse(raw);
}
