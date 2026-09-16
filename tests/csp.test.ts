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
  it("frames nothing and is never framed", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(directive(policy, "frame-src")).toBe("'none'");
    expect(directive(policy, "frame-ancestors")).toBe("'none'");
    // Payment pages are a top-level navigation; no provider host is ever allowed.
    expect(policy).not.toContain("paymob");
    expect(policy).not.toContain("paddle");
  });

  it("keeps the nonce and strict-dynamic", () => {
    const policy = buildContentSecurityPolicy(base);
    expect(directive(policy, "script-src")).toContain("'nonce-abc123'");
    expect(directive(policy, "script-src")).toContain("'strict-dynamic'");
  });
});
