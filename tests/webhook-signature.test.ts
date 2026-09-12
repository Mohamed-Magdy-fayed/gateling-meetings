import { describe, expect, it } from "vitest";

import {
  computeWebhookSignature,
  parseSignatureHeader,
  signWebhook,
  verifyWebhookSignature,
} from "@/integrations/webhooks/signature";

const SECRET = "whsec_test";
const BODY = JSON.stringify({ id: "d1", event: "meeting.ended", data: {} });

describe("signWebhook", () => {
  it("emits t=<ts>,v1=<hex> over `${t}.${body}`", () => {
    const header = signWebhook(SECRET, BODY, 1_700_000_000);
    expect(header).toBe(
      `t=1700000000,v1=${computeWebhookSignature(SECRET, 1_700_000_000, BODY)}`,
    );
    expect(parseSignatureHeader(header)).toEqual({
      timestamp: 1_700_000_000,
      signature: computeWebhookSignature(SECRET, 1_700_000_000, BODY),
    });
  });
});

describe("verifyWebhookSignature", () => {
  const now = 1_700_000_000;

  it("accepts a fresh, correctly signed delivery", () => {
    const header = signWebhook(SECRET, BODY, now);
    expect(
      verifyWebhookSignature({ secret: SECRET, header, body: BODY, now }),
    ).toBe(true);
  });

  it("rejects a modified body", () => {
    const header = signWebhook(SECRET, BODY, now);
    expect(
      verifyWebhookSignature({
        secret: SECRET,
        header,
        body: `${BODY} `,
        now,
      }),
    ).toBe(false);
  });

  it("rejects the wrong secret", () => {
    const header = signWebhook(SECRET, BODY, now);
    expect(
      verifyWebhookSignature({ secret: "other", header, body: BODY, now }),
    ).toBe(false);
  });

  it("rejects a delivery older than the tolerance (replay)", () => {
    const header = signWebhook(SECRET, BODY, now - 10 * 60);
    expect(
      verifyWebhookSignature({ secret: SECRET, header, body: BODY, now }),
    ).toBe(false);
    expect(
      verifyWebhookSignature({
        secret: SECRET,
        header,
        body: BODY,
        now,
        toleranceSeconds: 60 * 60,
      }),
    ).toBe(true);
  });

  it("rejects malformed or missing headers", () => {
    for (const header of [null, "", "v1=abc", "t=abc,v1=00", "t=1"]) {
      expect(
        verifyWebhookSignature({ secret: SECRET, header, body: BODY, now }),
      ).toBe(false);
    }
  });
});
