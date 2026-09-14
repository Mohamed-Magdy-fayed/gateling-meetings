import { describe, expect, it } from "vitest";

import { formatDisplayPrice } from "@/features/billing/price-format";

describe("formatDisplayPrice", () => {
  it("drops the cents when the amount is whole", () => {
    expect(
      formatDisplayPrice(
        { amount: 300, currencyCode: "USD", interval: "month" },
        "en",
      ),
    ).toBe("$3");
  });

  it("keeps the cents otherwise", () => {
    expect(
      formatDisplayPrice(
        { amount: 350, currencyCode: "USD", interval: "month" },
        "en",
      ),
    ).toBe("$3.50");
  });

  it("formats for the viewer's locale", () => {
    const out = formatDisplayPrice(
      { amount: 600, currencyCode: "USD", interval: "month" },
      "ar",
    );
    expect(out).toContain("6");
    expect(out).toMatch(/US\$|\$/);
  });
});
