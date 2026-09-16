import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paymob signs its callbacks with HMAC-SHA512 over the *values* of a fixed,
 * ordered list of fields, concatenated with no separator, hex-encoded in
 * lower case. Which fields, and in which order, differs per callback type;
 * the lists below are Paymob's documented ones and must not be reordered.
 */

/** Transaction processed callback (`type: "TRANSACTION"`), nested keys. */
export const TRANSACTION_HMAC_FIELDS = [
  "amount_cents",
  "created_at",
  "currency",
  "error_occured",
  "has_parent_transaction",
  "id",
  "integration_id",
  "is_3d_secure",
  "is_auth",
  "is_capture",
  "is_refunded",
  "is_standalone_payment",
  "is_voided",
  "order.id",
  "owner",
  "pending",
  "source_data.pan",
  "source_data.sub_type",
  "source_data.type",
  "success",
] as const;

/** Card token callback (`type: "TOKEN"`), keys in lexicographical order. */
export const TOKEN_HMAC_FIELDS = [
  "card_subtype",
  "created_at",
  "email",
  "id",
  "masked_pan",
  "merchant_id",
  "order_id",
  "token",
] as const;

/** `order.id` → `obj.order.id`; a missing key contributes an empty string. */
function valueAt(obj: Record<string, unknown>, path: string): string {
  let current: unknown = obj;
  for (const key of path.split(".")) {
    if (current == null || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[key];
  }
  if (current == null) return "";
  return String(current);
}

export function concatenateFields(
  obj: Record<string, unknown>,
  fields: readonly string[],
): string {
  return fields.map((field) => valueAt(obj, field)).join("");
}

export function computeHmac(message: string, secret: string): string {
  return createHmac("sha512", secret).update(message).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a.toLowerCase(), "utf8");
  const bufB = Buffer.from(b.toLowerCase(), "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function verifyTransactionHmac(
  obj: Record<string, unknown>,
  received: string | null | undefined,
  secret: string,
): boolean {
  if (!received) return false;
  const expected = computeHmac(
    concatenateFields(obj, TRANSACTION_HMAC_FIELDS),
    secret,
  );
  return safeEqual(expected, received);
}

export function verifyTokenHmac(
  obj: Record<string, unknown>,
  received: string | null | undefined,
  secret: string,
): boolean {
  if (!received) return false;
  const expected = computeHmac(
    concatenateFields(obj, TOKEN_HMAC_FIELDS),
    secret,
  );
  return safeEqual(expected, received);
}
