import crypto from "node:crypto";

/**
 * API keys look like `gm_live_<43 base64url chars>` (32 random bytes). The
 * first `PREFIX_LENGTH` characters of the random part are stored in clear
 * as the lookup column; the whole key is stored only as a SHA-256. Pure —
 * no database — so it is unit-tested directly.
 */
export const API_KEY_PREFIX = "gm_live_";
const RANDOM_BYTES = 32;
const PREFIX_LENGTH = 8;
const API_KEY_PATTERN = /^gm_live_[A-Za-z0-9_-]{43}$/;

export type GeneratedApiKey = {
  /** The full key — shown to the admin exactly once. */
  key: string;
  /** Lookup column. */
  prefix: string;
  /** What is stored; compare with `verifyApiKey`. */
  hash: string;
};

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): GeneratedApiKey {
  const key = `${API_KEY_PREFIX}${crypto.randomBytes(RANDOM_BYTES).toString("base64url")}`;
  return { key, prefix: apiKeyPrefix(key), hash: hashApiKey(key) };
}

export function apiKeyPrefix(key: string): string {
  return key.slice(
    API_KEY_PREFIX.length,
    API_KEY_PREFIX.length + PREFIX_LENGTH,
  );
}

/** Shape check only — cheap enough to run before touching the database. */
export function isWellFormedApiKey(key: string): boolean {
  return API_KEY_PATTERN.test(key);
}

/** Constant-time: a wrong key takes exactly as long as a right one. */
export function verifyApiKey(key: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(key), "hex");
  const b = Buffer.from(storedHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Webhook secrets are opaque random strings; the receiver only ever HMACs with them. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(32).toString("base64url")}`;
}
