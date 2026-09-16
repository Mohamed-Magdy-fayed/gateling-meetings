import "server-only";

import { z } from "zod";

import { env } from "@/data/env/server";

/** Egypt's Accept host; test and live are told apart by the keys, not the URL. */
export const PAYMOB_BASE_URL = "https://accept.paymob.com";

/** Legacy auth tokens last an hour; refresh well before that. */
const AUTH_TOKEN_TTL_MS = 50 * 60 * 1000;

export class PaymobApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
    readonly body: string,
  ) {
    super(`Paymob ${path} responded ${status}: ${body.slice(0, 300)}`);
    this.name = "PaymobApiError";
  }
}

function requireKeys() {
  const { PAYMOB_API_KEY, PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY } = env;
  if (!PAYMOB_API_KEY || !PAYMOB_SECRET_KEY || !PAYMOB_PUBLIC_KEY) {
    throw new Error("Paymob is not configured");
  }
  return { PAYMOB_API_KEY, PAYMOB_SECRET_KEY, PAYMOB_PUBLIC_KEY };
}

async function request<T>(
  path: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(`${PAYMOB_BASE_URL}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  const text = await response.text();
  if (!response.ok) throw new PaymobApiError(response.status, path, text);
  const json: unknown = text ? JSON.parse(text) : null;
  return schema.parse(json);
}

let auth: { token: string; expiresAt: number } | null = null;

/**
 * Bearer token for the `/api/acceptance/*` endpoints (plans, subscriptions,
 * transactions). The intention API uses the secret key directly instead.
 */
async function bearer(): Promise<string> {
  const now = Date.now();
  if (auth && auth.expiresAt > now) return auth.token;
  const { PAYMOB_API_KEY } = requireKeys();
  const { token } = await request(
    "/api/auth/tokens",
    { method: "POST", body: JSON.stringify({ api_key: PAYMOB_API_KEY }) },
    z.object({ token: z.string().min(1) }),
  );
  auth = { token, expiresAt: now + AUTH_TOKEN_TTL_MS };
  return token;
}

/** A `/api/acceptance/*` call, authenticated with the cached bearer. */
export async function acceptance<T>(
  path: string,
  init: Omit<RequestInit, "body"> & { body?: unknown },
  schema: z.ZodType<T>,
): Promise<T> {
  const token = await bearer();
  return request(
    path,
    {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${token}` },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    },
    schema,
  );
}

const intentionResponseSchema = z
  .object({
    id: z.string(),
    client_secret: z.string().min(1),
    intention_order_id: z.union([z.number(), z.string()]).nullish(),
  })
  .passthrough();

export type IntentionResponse = z.infer<typeof intentionResponseSchema>;

/** `POST /v1/intention/` — a payment page for the unified checkout to open. */
export async function createIntention(
  body: Record<string, unknown>,
): Promise<IntentionResponse> {
  const { PAYMOB_SECRET_KEY } = requireKeys();
  return request(
    "/v1/intention/",
    {
      method: "POST",
      headers: { authorization: `Token ${PAYMOB_SECRET_KEY}` },
      body: JSON.stringify(body),
    },
    intentionResponseSchema,
  );
}

/** The hosted page for an intention; a top-level navigation, never framed. */
export function unifiedCheckoutUrl(clientSecret: string): string {
  const { PAYMOB_PUBLIC_KEY } = requireKeys();
  const url = new URL("/unifiedcheckout/", PAYMOB_BASE_URL);
  url.searchParams.set("publicKey", PAYMOB_PUBLIC_KEY);
  url.searchParams.set("clientSecret", clientSecret);
  return url.toString();
}

/** Test-only hook so unit tests never hit the network. */
export function resetPaymobAuthCache() {
  auth = null;
}
