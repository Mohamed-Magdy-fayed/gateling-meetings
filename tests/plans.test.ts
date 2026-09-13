import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";

import {
  assertEntitlement,
  EntitlementError,
  entitlementErrorData,
  meetingEndsAt,
  PLAN_ENTITLEMENTS,
  type PlanFacts,
  resolveEntitlements,
  UNLIMITED_ENTITLEMENTS,
} from "@/features/billing/plans";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";

const { t } = createI18n(mainTranslations, "en", "en");
const NOW = new Date("2026-09-13T12:00:00Z");
const HOUR = 60 * 60 * 1000;

function org(overrides: Partial<PlanFacts> = {}): PlanFacts {
  return {
    plan: "free",
    planSource: "free",
    planExpiresAt: null,
    seatLimit: 1,
    ...overrides,
  };
}

describe("PLAN_ENTITLEMENTS", () => {
  it("defines every key for every plan, and paid plans strictly beat free", () => {
    for (const plan of ["free", "pro", "business"] as const) {
      const e = PLAN_ENTITLEMENTS[plan];
      expect(e.maxParticipants).toBeGreaterThan(0);
      expect(typeof e.breakouts).toBe("boolean");
      expect(typeof e.apiAccess).toBe("boolean");
    }
    expect(PLAN_ENTITLEMENTS.pro.maxParticipants).toBeGreaterThan(
      PLAN_ENTITLEMENTS.free.maxParticipants,
    );
    expect(PLAN_ENTITLEMENTS.business.apiAccess).toBe(true);
    expect(PLAN_ENTITLEMENTS.free.apiAccess).toBe(false);
  });
});

describe("resolveEntitlements", () => {
  it("returns the plan's entitlements when nothing has expired", () => {
    const resolved = resolveEntitlements(
      org({ plan: "pro", planSource: "manual", seatLimit: 5 }),
      { now: NOW },
    );
    expect(resolved.effectivePlan).toBe("pro");
    expect(resolved.expired).toBe(false);
    expect(resolved.seatLimit).toBe(5);
    expect(resolved.maxParticipants).toBe(
      PLAN_ENTITLEMENTS.pro.maxParticipants,
    );
  });

  it("drops an expired manual grant to free, seats included", () => {
    const resolved = resolveEntitlements(
      org({
        plan: "business",
        planSource: "manual",
        seatLimit: 20,
        planExpiresAt: new Date(NOW.getTime() - 1),
      }),
      { now: NOW },
    );
    expect(resolved.plan).toBe("business");
    expect(resolved.effectivePlan).toBe("free");
    expect(resolved.expired).toBe(true);
    expect(resolved.seatLimit).toBe(PLAN_ENTITLEMENTS.free.seatsIncluded);
    expect(resolved.apiAccess).toBe(false);
  });

  it("treats an expiry exactly at `now` as expired", () => {
    const resolved = resolveEntitlements(
      org({ plan: "pro", planSource: "trial", planExpiresAt: NOW }),
      { now: NOW },
    );
    expect(resolved.expired).toBe(true);
  });

  it("keeps a lapsing subscription on its plan until the instant passes", () => {
    const resolved = resolveEntitlements(
      org({
        plan: "pro",
        planSource: "subscription",
        planExpiresAt: new Date(NOW.getTime() + HOUR),
      }),
      { now: NOW },
    );
    expect(resolved.effectivePlan).toBe("pro");
  });

  it("gives ADMIN_EMAILS accounts everything, expiry or not", () => {
    const resolved = resolveEntitlements(
      org({ planExpiresAt: new Date(NOW.getTime() - HOUR) }),
      { isAdmin: true, now: NOW },
    );
    expect(resolved.unlimited).toBe(true);
    expect(resolved.maxMeetingMinutes).toBeNull();
    expect(resolved.apiAccess).toBe(true);
    expect(resolved.maxParticipants).toBe(
      UNLIMITED_ENTITLEMENTS.maxParticipants,
    );
  });

  it("never reports fewer than one seat", () => {
    expect(resolveEntitlements(org({ seatLimit: 0 })).seatLimit).toBe(1);
  });
});

describe("assertEntitlement", () => {
  const free = PLAN_ENTITLEMENTS.free;

  function thrown(fn: () => void): TRPCError {
    try {
      fn();
    } catch (error) {
      if (error instanceof TRPCError) return error;
      throw error;
    }
    throw new Error("expected a TRPCError");
  }

  it("refuses breakouts on free with FORBIDDEN and a typed cause", () => {
    const error = thrown(() => assertEntitlement(t, free, "breakouts"));
    expect(error.code).toBe("FORBIDDEN");
    expect(error.cause).toBeInstanceOf(EntitlementError);
    expect(entitlementErrorData(error.cause)).toEqual({
      key: "breakouts",
      max: undefined,
    });
  });

  it("allows breakouts on pro", () => {
    expect(() =>
      assertEntitlement(t, PLAN_ENTITLEMENTS.pro, "breakouts"),
    ).not.toThrow();
  });

  it("admits one more participant while under the cap, refuses at it", () => {
    expect(() =>
      assertEntitlement(t, free, "maxParticipants", free.maxParticipants - 1),
    ).not.toThrow();
    const error = thrown(() =>
      assertEntitlement(t, free, "maxParticipants", free.maxParticipants),
    );
    expect(error.code).toBe("PRECONDITION_FAILED");
    expect(error.message).toContain(String(free.maxParticipants));
    expect(entitlementErrorData(error.cause)?.max).toBe(free.maxParticipants);
  });

  it("caps meeting minutes inclusively", () => {
    expect(() =>
      assertEntitlement(t, free, "maxMeetingMinutes", 40),
    ).not.toThrow();
    expect(
      thrown(() => assertEntitlement(t, free, "maxMeetingMinutes", 41)).code,
    ).toBe("BAD_REQUEST");
  });

  it("treats a null limit as unlimited", () => {
    expect(() =>
      assertEntitlement(t, UNLIMITED_ENTITLEMENTS, "maxMeetingMinutes", 1e9),
    ).not.toThrow();
    expect(() =>
      assertEntitlement(t, PLAN_ENTITLEMENTS.pro, "maxUpcomingScheduled", 1e9),
    ).not.toThrow();
  });

  it("counts upcoming scheduled meetings against the cap", () => {
    expect(() =>
      assertEntitlement(t, free, "maxUpcomingScheduled", 2),
    ).not.toThrow();
    expect(
      thrown(() => assertEntitlement(t, free, "maxUpcomingScheduled", 3)).code,
    ).toBe("PRECONDITION_FAILED");
  });

  it("entitlementErrorData ignores unrelated causes", () => {
    expect(entitlementErrorData(new Error("x"))).toBeNull();
    expect(entitlementErrorData(undefined)).toBeNull();
  });
});

describe("meetingEndsAt", () => {
  it("adds the cap to the start", () => {
    expect(meetingEndsAt(NOW, PLAN_ENTITLEMENTS.free)?.toISOString()).toBe(
      new Date(NOW.getTime() + 40 * 60_000).toISOString(),
    );
  });

  it("is null when the plan has no cap", () => {
    expect(meetingEndsAt(NOW, UNLIMITED_ENTITLEMENTS)).toBeNull();
  });
});
