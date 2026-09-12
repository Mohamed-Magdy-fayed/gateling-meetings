import crypto from "node:crypto";
import { errors as joseErrors, jwtVerify, SignJWT } from "jose";
import { z } from "zod";

import type { SsoRole } from "@/drizzle/schema";

/**
 * The `/sso/join?token=…` link. HS256 with `JWT_SECRET_KEY`; the audience
 * is the integration's slug so a token minted for one system is not valid
 * as another's. Pure over an injected secret so it unit-tests without env.
 */
export const SSO_ISSUER = "meetings";
export const DEFAULT_SSO_TTL_SECONDS = 10 * 60;
export const MAX_SSO_TTL_SECONDS = 24 * 60 * 60;

export const ssoClaimsSchema = z.object({
  /** Integration slug. */
  aud: z.string().min(1),
  meetingCode: z.string().min(1),
  role: z.enum(["host", "participant"]),
  externalId: z.string().min(1).max(128),
  name: z.string().min(1).max(64),
  email: z.email().optional(),
  returnUrl: z.url().optional(),
  jti: z.string().min(1),
  exp: z.number(),
});

export type SsoClaims = z.infer<typeof ssoClaimsSchema>;

export type MintSsoTokenInput = {
  integrationSlug: string;
  meetingCode: string;
  role: SsoRole;
  externalId: string;
  name: string;
  email?: string | null;
  returnUrl?: string | null;
  expiresInSeconds?: number;
};

function keyFor(secret: string) {
  return new TextEncoder().encode(secret);
}

export async function mintSsoToken(
  secret: string,
  input: MintSsoTokenInput,
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  const ttl = Math.min(
    Math.max(input.expiresInSeconds ?? DEFAULT_SSO_TTL_SECONDS, 1),
    MAX_SSO_TTL_SECONDS,
  );
  const jti = crypto.randomBytes(16).toString("base64url");
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const token = await new SignJWT({
    meetingCode: input.meetingCode,
    role: input.role,
    externalId: input.externalId,
    name: input.name,
    ...(input.email ? { email: input.email } : {}),
    ...(input.returnUrl ? { returnUrl: input.returnUrl } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(SSO_ISSUER)
    .setAudience(input.integrationSlug)
    .setJti(jti)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(keyFor(secret));

  return { token, jti, expiresAt };
}

export type SsoVerification =
  | { ok: true; claims: SsoClaims }
  | { ok: false; reason: "expired" | "invalid" };

/**
 * Signature, issuer and expiry are checked here; the audience is returned
 * for the caller to match against the integration it loads (the slug is
 * *in* the token, so it cannot be an input to verification).
 */
export async function verifySsoToken(
  secret: string,
  token: string,
): Promise<SsoVerification> {
  try {
    const { payload } = await jwtVerify(token, keyFor(secret), {
      issuer: SSO_ISSUER,
      algorithms: ["HS256"],
    });
    const aud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;
    const parsed = ssoClaimsSchema.safeParse({ ...payload, aud });
    if (!parsed.success) return { ok: false, reason: "invalid" };
    return { ok: true, claims: parsed.data };
  } catch (error) {
    if (error instanceof joseErrors.JWTExpired) {
      return { ok: false, reason: "expired" };
    }
    return { ok: false, reason: "invalid" };
  }
}
