import { describe, expect, it } from "vitest";

import { matchPlanGrant } from "@/features/billing/server/grants";

const NOW = new Date("2026-09-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;

let seq = 0;
function grant(
  overrides: Partial<{
    email: string;
    expiresAt: Date | null;
    consumedAt: Date | null;
    createdAt: Date;
  }> = {},
) {
  seq += 1;
  return {
    id: `g${seq}`,
    email: "partner@example.com",
    expiresAt: null,
    consumedAt: null,
    createdAt: new Date(NOW.getTime() - seq * 1000),
    ...overrides,
  };
}

describe("matchPlanGrant", () => {
  it("matches regardless of case and surrounding whitespace", () => {
    const g = grant({ email: "partner@example.com" });
    expect(matchPlanGrant([g], "  Partner@Example.COM ", NOW)?.id).toBe(g.id);
  });

  it("ignores other addresses", () => {
    expect(matchPlanGrant([grant()], "someone@else.com", NOW)).toBeNull();
  });

  it("skips consumed grants", () => {
    const used = grant({ consumedAt: NOW });
    expect(matchPlanGrant([used], "partner@example.com", NOW)).toBeNull();
  });

  it("skips expired grants but honours ones that expire later", () => {
    const expired = grant({ expiresAt: new Date(NOW.getTime() - DAY) });
    expect(matchPlanGrant([expired], "partner@example.com", NOW)).toBeNull();
    const live = grant({ expiresAt: new Date(NOW.getTime() + DAY) });
    expect(matchPlanGrant([live], "partner@example.com", NOW)?.id).toBe(
      live.id,
    );
  });

  it("prefers the newest live grant when several exist", () => {
    const older = grant({ createdAt: new Date(NOW.getTime() - 2 * DAY) });
    const newer = grant({ createdAt: new Date(NOW.getTime() - DAY) });
    expect(matchPlanGrant([older, newer], "partner@example.com", NOW)?.id).toBe(
      newer.id,
    );
  });
});
