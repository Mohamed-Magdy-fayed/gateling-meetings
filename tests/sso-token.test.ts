import { describe, expect, it } from "vitest";

import {
  MAX_SSO_TTL_SECONDS,
  mintSsoToken,
  verifySsoToken,
} from "@/integrations/sso/token";

const SECRET = "unit-test-secret-that-is-at-least-32-characters-long";

const input = {
  integrationSlug: "atelier",
  meetingCode: "abc-defg-hij",
  role: "host" as const,
  externalId: "user-42",
  name: "Alaa",
  email: "alaa@example.test",
  returnUrl: "https://atelier.example/orders/8812",
};

describe("mintSsoToken / verifySsoToken", () => {
  it("round-trips every claim", async () => {
    const { token, jti, expiresAt } = await mintSsoToken(SECRET, input);
    const result = await verifySsoToken(SECRET, token);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.claims).toMatchObject({
      aud: "atelier",
      meetingCode: "abc-defg-hij",
      role: "host",
      externalId: "user-42",
      name: "Alaa",
      email: "alaa@example.test",
      returnUrl: "https://atelier.example/orders/8812",
      jti,
    });
    expect(result.claims.exp).toBe(Math.floor(expiresAt.getTime() / 1000));
  });

  it("omits email and returnUrl when not given", async () => {
    const { token } = await mintSsoToken(SECRET, {
      ...input,
      email: null,
      returnUrl: null,
    });
    const result = await verifySsoToken(SECRET, token);
    expect(result.ok && result.claims.email).toBeUndefined();
    expect(result.ok && result.claims.returnUrl).toBeUndefined();
  });

  it("defaults to ten minutes and caps at 24 hours", async () => {
    const before = Date.now();
    const short = await mintSsoToken(SECRET, input);
    expect(short.expiresAt.getTime() - before).toBeGreaterThan(9 * 60_000);
    expect(short.expiresAt.getTime() - before).toBeLessThan(11 * 60_000);

    const long = await mintSsoToken(SECRET, {
      ...input,
      expiresInSeconds: MAX_SSO_TTL_SECONDS * 10,
    });
    expect(long.expiresAt.getTime() - before).toBeLessThanOrEqual(
      MAX_SSO_TTL_SECONDS * 1000 + 1000,
    );
  });

  it("reports an expired token as expired", async () => {
    const { token } = await mintSsoToken(SECRET, {
      ...input,
      expiresInSeconds: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const result = await verifySsoToken(SECRET, token);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await mintSsoToken(`${SECRET}-other`, input);
    expect(await verifySsoToken(SECRET, token)).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("rejects a tampered payload", async () => {
    const { token } = await mintSsoToken(SECRET, input);
    const [header, payload, signature] = token.split(".");
    const decoded = JSON.parse(
      Buffer.from(payload as string, "base64url").toString(),
    );
    decoded.role = "participant";
    const forged = Buffer.from(JSON.stringify(decoded)).toString("base64url");
    expect(
      await verifySsoToken(SECRET, `${header}.${forged}.${signature}`),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects garbage", async () => {
    expect(await verifySsoToken(SECRET, "not-a-jwt")).toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("carries the audience so the caller can match the integration", async () => {
    const { token } = await mintSsoToken(SECRET, {
      ...input,
      integrationSlug: "tms",
    });
    const result = await verifySsoToken(SECRET, token);
    expect(result.ok && result.claims.aud).toBe("tms");
  });
});
