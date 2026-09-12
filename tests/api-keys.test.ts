import { describe, expect, it } from "vitest";

import {
  API_KEY_PREFIX,
  apiKeyPrefix,
  generateApiKey,
  generateWebhookSecret,
  hashApiKey,
  isWellFormedApiKey,
  verifyApiKey,
} from "@/integrations/api/keys";

describe("generateApiKey", () => {
  it("produces a gm_live_ key with a 43-char base64url body", () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true);
    expect(isWellFormedApiKey(key)).toBe(true);
    expect(prefix).toHaveLength(8);
    expect(prefix).toBe(apiKeyPrefix(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never repeats", () => {
    const keys = new Set(
      Array.from({ length: 50 }, () => generateApiKey().key),
    );
    expect(keys.size).toBe(50);
  });
});

describe("verifyApiKey", () => {
  it("accepts the key whose hash was stored", () => {
    const { key, hash } = generateApiKey();
    expect(verifyApiKey(key, hash)).toBe(true);
    expect(hashApiKey(key)).toBe(hash);
  });

  it("rejects a key that differs by one character", () => {
    const { key, hash } = generateApiKey();
    const last = key.at(-1) === "A" ? "B" : "A";
    expect(verifyApiKey(`${key.slice(0, -1)}${last}`, hash)).toBe(false);
  });

  it("rejects a stored hash of the wrong length without throwing", () => {
    const { key } = generateApiKey();
    expect(verifyApiKey(key, "abcd")).toBe(false);
  });
});

describe("isWellFormedApiKey", () => {
  it("refuses other prefixes, wrong lengths and non-base64url characters", () => {
    expect(isWellFormedApiKey("gm_test_" + "a".repeat(43))).toBe(false);
    expect(isWellFormedApiKey("gm_live_" + "a".repeat(42))).toBe(false);
    expect(isWellFormedApiKey("gm_live_" + "a".repeat(42) + "+")).toBe(false);
    expect(isWellFormedApiKey("")).toBe(false);
  });
});

describe("generateWebhookSecret", () => {
  it("is prefixed and long", () => {
    const secret = generateWebhookSecret();
    expect(secret.startsWith("whsec_")).toBe(true);
    expect(secret.length).toBeGreaterThan(40);
  });
});
