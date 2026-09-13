import { describe, expect, it } from "vitest";

import { buildContentSecurityPolicy } from "@/integrations/security/csp";

const base = { nonce: "abc123", isDevelopment: false };

function directive(policy: string, name: string) {
  return policy
    .split("; ")
    .find((entry) => entry.startsWith(`${name} `))
    ?.slice(name.length + 1);
}

describe("buildContentSecurityPolicy", () => {
  it("frames nothing by default", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(directive(policy, "frame-src")).toBe("'none'");
    expect(directive(policy, "script-src")).not.toContain("paddle");
    expect(directive(policy, "connect-src")).not.toContain("paddle");
  });

  it("opens exactly Paddle's hosts on billing pages", () => {
    const policy = buildContentSecurityPolicy({ ...base, paddle: true });
    expect(directive(policy, "frame-src")).toBe(
      "https://buy.paddle.com https://sandbox-buy.paddle.com",
    );
    expect(directive(policy, "script-src")).toContain("https://cdn.paddle.com");
    expect(directive(policy, "connect-src")).toContain("https://*.paddle.com");
    // Never the other way round: framing *us* stays forbidden.
    expect(directive(policy, "frame-ancestors")).toBe("'none'");
  });

  it("keeps the nonce and strict-dynamic either way", () => {
    for (const paddle of [false, true]) {
      const policy = buildContentSecurityPolicy({ ...base, paddle });
      expect(directive(policy, "script-src")).toContain("'nonce-abc123'");
      expect(directive(policy, "script-src")).toContain("'strict-dynamic'");
    }
  });
});
