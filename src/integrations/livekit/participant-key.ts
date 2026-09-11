import "server-only";

import crypto from "node:crypto";

import { getLiveKitConfig } from "./client";

/**
 * A guest has no account, so nothing else proves "I am `guest:abc`" when
 * they later ask the server to move them (return from a breakout). The
 * join response hands them an HMAC of their identity; the request echoes
 * it. Keyed with the LiveKit secret, which is exactly as secret as the
 * tokens it already protects.
 */
export function signParticipantIdentity(identity: string): string {
  const { apiSecret } = getLiveKitConfig();
  return crypto
    .createHmac("sha256", apiSecret)
    .update(identity)
    .digest("base64url");
}

export function verifyParticipantKey(identity: string, key: string): boolean {
  const expected = Buffer.from(signParticipantIdentity(identity));
  const given = Buffer.from(key);
  return (
    expected.length === given.length && crypto.timingSafeEqual(expected, given)
  );
}
