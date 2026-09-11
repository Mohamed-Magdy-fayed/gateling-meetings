import crypto from "node:crypto";

const RESET_TOKEN_BYTES = 32;
export const EMAIL_TOKEN_TTL_MS = 1000 * 60 * 60 * 24; // 24h

export function createTokenValue(byteLength: number = RESET_TOKEN_BYTES) {
  return crypto.randomBytes(byteLength).toString("hex");
}

export function hashTokenValue(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
