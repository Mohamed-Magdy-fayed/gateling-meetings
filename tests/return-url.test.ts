import { describe, expect, it } from "vitest";

import { isAllowedReturnUrl } from "@/integrations/sso/return-url";

const ALLOWED = ["https://atelier.example", "http://localhost:3001"];

describe("isAllowedReturnUrl", () => {
  it("accepts any path on an allowed origin", () => {
    expect(
      isAllowedReturnUrl("https://atelier.example/orders/1", ALLOWED),
    ).toBe(true);
    expect(isAllowedReturnUrl("http://localhost:3001/", ALLOWED)).toBe(true);
  });

  it("is origin-exact: scheme, host and port all matter", () => {
    expect(isAllowedReturnUrl("http://atelier.example/", ALLOWED)).toBe(false);
    expect(isAllowedReturnUrl("https://atelier.example.evil/", ALLOWED)).toBe(
      false,
    );
    expect(isAllowedReturnUrl("https://evil.atelier.example/", ALLOWED)).toBe(
      false,
    );
    expect(isAllowedReturnUrl("http://localhost:3000/", ALLOWED)).toBe(false);
  });

  it("refuses non-http schemes and garbage", () => {
    expect(isAllowedReturnUrl("javascript:alert(1)", ALLOWED)).toBe(false);
    expect(isAllowedReturnUrl("not a url", ALLOWED)).toBe(false);
    expect(isAllowedReturnUrl("https://atelier.example/", [])).toBe(false);
    expect(isAllowedReturnUrl("https://atelier.example/", ["nope"])).toBe(
      false,
    );
  });

  it("ignores userinfo tricks", () => {
    expect(
      isAllowedReturnUrl("https://atelier.example@evil.example/", ALLOWED),
    ).toBe(false);
  });
});
