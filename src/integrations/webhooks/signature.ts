import crypto from "node:crypto";

/**
 * Stripe-style signature for outbound webhooks, pure and dependency-free so
 * it is unit-testable and the receiving side (`docs/webhooks.md`) can copy
 * it verbatim. The timestamp is part of the signed string, so a captured
 * delivery cannot be replayed once it is older than the tolerance.
 *
 *   X-Meetings-Signature: t=<unix seconds>,v1=<hex hmac-sha256(secret, `${t}.${body}`)>
 */
export const SIGNATURE_HEADER = "x-meetings-signature";
export const EVENT_HEADER = "x-meetings-event";
export const DELIVERY_HEADER = "x-meetings-delivery";

/** Five minutes: generous for clock skew, short for replay. */
export const DEFAULT_TOLERANCE_SECONDS = 5 * 60;

export function computeWebhookSignature(
  secret: string,
  timestamp: number,
  body: string,
): string {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
}

export function signWebhook(
  secret: string,
  body: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  return `t=${timestamp},v1=${computeWebhookSignature(secret, timestamp, body)}`;
}

export function parseSignatureHeader(
  header: string | null | undefined,
): { timestamp: number; signature: string } | null {
  if (!header) return null;
  const parts = new Map(
    header.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")] as const;
    }),
  );
  const timestamp = Number(parts.get("t"));
  const signature = parts.get("v1");
  if (!Number.isInteger(timestamp) || !signature) return null;
  return { timestamp, signature };
}

/**
 * Constant-time check of a received delivery. `now` is injectable for tests.
 */
export function verifyWebhookSignature({
  secret,
  header,
  body,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  now = Math.floor(Date.now() / 1000),
}: {
  secret: string;
  header: string | null | undefined;
  body: string;
  toleranceSeconds?: number;
  now?: number;
}): boolean {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(now - parsed.timestamp) > toleranceSeconds) return false;

  const expected = computeWebhookSignature(secret, parsed.timestamp, body);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parsed.signature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
