import { describe, expect, it } from "vitest";

import { parsePaddleEvent } from "@/features/billing/server/paddle-events";
import {
  decideApply,
  PAST_DUE_GRACE_MS,
  type SubscriptionFacts,
  subscriptionAccess,
  subscriptionGrantsAccess,
  subscriptionToPlanChange,
} from "@/features/billing/server/subscription-mapping";
import {
  createPriceMap,
  planToPriceId,
  priceIdToPlan,
} from "@/integrations/paddle/prices";

const prices = {
  pro: { month: "pri_pro", year: "pri_pro_year" },
  business: { month: "pri_biz", year: "pri_biz_year" },
} as const;
const NOW = new Date("2026-09-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const periodEnd = new Date(NOW.getTime() + 20 * DAY);

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    id: "sub_1",
    customerId: "ctm_1",
    status: "active",
    items: [{ priceId: "pri_pro", productId: "pro_pro", quantity: 3 }],
    currentBillingPeriod: { startsAt: null, endsAt: periodEnd.toISOString() },
    scheduledChange: null,
    canceledAt: null,
    pausedAt: null,
    ...overrides,
  };
}

describe("price map", () => {
  it("is null until all four ids are set", () => {
    expect(
      createPriceMap({
        pro: { month: "a", year: "b" },
        business: { month: "c", year: undefined },
      }),
    ).toBeNull();
    expect(
      createPriceMap({
        pro: { month: "a", year: "b" },
        business: { month: "c", year: "d" },
      }),
    ).toEqual({
      pro: { month: "a", year: "b" },
      business: { month: "c", year: "d" },
    });
  });
  it("maps ids of either interval to a plan and rejects strangers", () => {
    expect(priceIdToPlan(prices, "pri_biz")).toBe("business");
    expect(priceIdToPlan(prices, "pri_biz_year")).toBe("business");
    expect(priceIdToPlan(prices, "pri_pro_year")).toBe("pro");
    expect(priceIdToPlan(prices, "pri_other")).toBeNull();
    expect(priceIdToPlan(prices, null)).toBeNull();
    expect(planToPriceId(prices, "pro", "month")).toBe("pri_pro");
    expect(planToPriceId(prices, "business", "year")).toBe("pri_biz_year");
  });
});

describe("subscriptionToPlanChange", () => {
  it("recognises a yearly price as the same plan", () => {
    const change = subscriptionToPlanChange(
      sub({
        items: [{ priceId: "pri_biz_year", productId: "pro_biz", quantity: 2 }],
      }),
      prices,
      NOW,
    );
    expect(change).toMatchObject({
      plan: "business",
      seatLimit: 2,
      paddlePriceId: "pri_biz_year",
    });
  });
  it("puts an active subscription on its plan with the bought seats", () => {
    const change = subscriptionToPlanChange(sub(), prices, NOW);
    expect(change).toMatchObject({
      plan: "pro",
      planSource: "subscription",
      seatLimit: 3,
      planExpiresAt: null,
      paddleSubscriptionId: "sub_1",
      paddleCustomerId: "ctm_1",
      paddlePriceId: "pri_pro",
    });
    expect(change?.currentPeriodEndsAt?.toISOString()).toBe(
      periodEnd.toISOString(),
    );
  });

  it("treats trialing like active", () => {
    expect(
      subscriptionToPlanChange(sub({ status: "trialing" }), prices, NOW),
    ).toMatchObject({ plan: "pro", planExpiresAt: null });
  });

  it("gives past_due a grace period after the period end", () => {
    const change = subscriptionToPlanChange(
      sub({ status: "past_due" }),
      prices,
      NOW,
    );
    expect(change?.plan).toBe("pro");
    expect(change?.planExpiresAt?.getTime()).toBe(
      periodEnd.getTime() + PAST_DUE_GRACE_MS,
    );
  });

  it("drops a paused subscription to free but keeps its id for the portal", () => {
    const resumeAt = new Date(NOW.getTime() + 5 * DAY).toISOString();
    const change = subscriptionToPlanChange(
      sub({
        status: "paused",
        scheduledChange: { action: "resume", effectiveAt: resumeAt },
      }),
      prices,
      NOW,
    );
    expect(change).toMatchObject({
      plan: "free",
      planSource: "free",
      seatLimit: 1,
      paddleSubscriptionId: "sub_1",
      paddleSubscriptionStatus: "paused",
    });
  });

  it("does not revoke an active plan because a cancel is scheduled", () => {
    const change = subscriptionToPlanChange(
      sub({
        scheduledChange: {
          action: "cancel",
          effectiveAt: periodEnd.toISOString(),
        },
      }),
      prices,
      NOW,
    );
    expect(change).toMatchObject({ plan: "pro", planExpiresAt: null });
  });

  it("keeps a cancelled-but-paid-up plan until the period ends", () => {
    const change = subscriptionToPlanChange(
      sub({ status: "canceled" }),
      prices,
      NOW,
    );
    expect(change?.plan).toBe("pro");
    expect(change?.planExpiresAt?.toISOString()).toBe(periodEnd.toISOString());
  });

  it("drops to free once a cancellation is effective", () => {
    const past = new Date(NOW.getTime() - DAY).toISOString();
    const change = subscriptionToPlanChange(
      sub({
        status: "canceled",
        scheduledChange: { action: "cancel", effectiveAt: past },
      }),
      prices,
      NOW,
    );
    expect(change).toMatchObject({
      plan: "free",
      planSource: "free",
      seatLimit: 1,
      paddleSubscriptionId: null,
    });
  });

  it("ignores a subscription for a price that is not ours", () => {
    expect(
      subscriptionToPlanChange(
        sub({
          items: [{ priceId: "pri_stranger", productId: null, quantity: 1 }],
        }),
        prices,
        NOW,
      ),
    ).toBeNull();
  });

  it("never reports fewer than one seat", () => {
    expect(
      subscriptionToPlanChange(
        sub({
          items: [{ priceId: "pri_biz", productId: "pro_biz", quantity: 0 }],
        }),
        prices,
        NOW,
      )?.seatLimit,
    ).toBe(1);
  });
});

describe("subscriptionAccess", () => {
  it("grants active and trialing indefinitely, scheduled change or not", () => {
    expect(subscriptionAccess(sub(), NOW)).toEqual({
      granted: true,
      until: null,
    });
    expect(subscriptionAccess(sub({ status: "trialing" }), NOW)).toEqual({
      granted: true,
      until: null,
    });
    const scheduled = sub({
      scheduledChange: {
        action: "cancel",
        effectiveAt: periodEnd.toISOString(),
      },
    });
    expect(subscriptionGrantsAccess(scheduled, NOW)).toBe(true);
    expect(
      subscriptionGrantsAccess(
        sub({
          scheduledChange: {
            action: "pause",
            effectiveAt: periodEnd.toISOString(),
          },
        }),
        NOW,
      ),
    ).toBe(true);
  });

  it("grants past_due only through the grace period", () => {
    const pastDue = sub({ status: "past_due" });
    expect(subscriptionGrantsAccess(pastDue, NOW)).toBe(true);
    const afterGrace = new Date(periodEnd.getTime() + PAST_DUE_GRACE_MS + 1);
    expect(subscriptionGrantsAccess(pastDue, afterGrace)).toBe(false);
  });

  it("revokes paused and effective cancellations", () => {
    expect(subscriptionGrantsAccess(sub({ status: "paused" }), NOW)).toBe(
      false,
    );
    expect(
      subscriptionGrantsAccess(
        sub({ status: "canceled", currentBillingPeriod: null }),
        NOW,
      ),
    ).toBe(false);
  });

  it("keeps a cancellation in its notice period until the instant", () => {
    const verdict = subscriptionAccess(sub({ status: "canceled" }), NOW);
    expect(verdict).toEqual({ granted: true, until: periodEnd });
    expect(subscriptionGrantsAccess(sub({ status: "canceled" }), NOW)).toBe(
      true,
    );
    expect(
      subscriptionGrantsAccess(sub({ status: "canceled" }), periodEnd),
    ).toBe(false);
  });
});

describe("decideApply", () => {
  it("never overwrites a hand-granted or trial plan", () => {
    expect(
      decideApply({ planSource: "manual", paddleSyncedAt: null }, NOW),
    ).toEqual({ apply: false, reason: "skipped_manual" });
    expect(
      decideApply({ planSource: "trial", paddleSyncedAt: null }, NOW),
    ).toEqual({ apply: false, reason: "skipped_manual" });
  });

  it("drops an event older than the last one applied", () => {
    expect(
      decideApply(
        { planSource: "subscription", paddleSyncedAt: NOW },
        new Date(NOW.getTime() - 1),
      ),
    ).toEqual({ apply: false, reason: "skipped_stale" });
  });

  it("applies fresh events to free and subscription orgs", () => {
    expect(
      decideApply({ planSource: "free", paddleSyncedAt: null }, NOW),
    ).toEqual({ apply: true });
    expect(
      decideApply({ planSource: "subscription", paddleSyncedAt: NOW }, NOW),
    ).toEqual({ apply: true });
  });
});

describe("parsePaddleEvent", () => {
  it("reads a subscription payload the way Paddle sends it", () => {
    const parsed = parsePaddleEvent("subscription.activated", {
      data: {
        id: "sub_9",
        customer_id: "ctm_9",
        status: "active",
        items: [
          { quantity: 4, price: { id: "pri_biz", product_id: "pro_biz" } },
        ],
        current_billing_period: {
          starts_at: NOW.toISOString(),
          ends_at: periodEnd.toISOString(),
        },
        scheduled_change: {
          action: "cancel",
          effective_at: periodEnd.toISOString(),
        },
        canceled_at: null,
        paused_at: null,
        custom_data: { organizationId: "3b241101-e2bb-4255-8caf-4136c566a962" },
      },
    });
    expect(parsed.kind).toBe("subscription");
    if (parsed.kind !== "subscription") throw new Error("unreachable");
    expect(parsed.facts.items[0]).toEqual({
      priceId: "pri_biz",
      productId: "pro_biz",
      quantity: 4,
    });
    expect(parsed.facts.currentBillingPeriod?.startsAt).toBe(NOW.toISOString());
    expect(parsed.facts.scheduledChange).toEqual({
      action: "cancel",
      effectiveAt: periodEnd.toISOString(),
    });
    expect(parsed.organizationId).toBe("3b241101-e2bb-4255-8caf-4136c566a962");
  });

  it("tolerates the fields Paddle omits on older or minimal payloads", () => {
    const parsed = parsePaddleEvent("subscription.created", {
      data: {
        id: "sub_9",
        customer_id: "ctm_9",
        status: "active",
        items: [{ quantity: 1, price: { id: "pri_pro" } }],
      },
    });
    if (parsed.kind !== "subscription") throw new Error("unreachable");
    expect(parsed.facts).toMatchObject({
      items: [{ priceId: "pri_pro", productId: null, quantity: 1 }],
      currentBillingPeriod: null,
      scheduledChange: null,
      canceledAt: null,
      pausedAt: null,
    });
  });

  it("reads a customer payload", () => {
    expect(
      parsePaddleEvent("customer.updated", {
        data: { id: "ctm_1", email: "a@b.test", name: null, status: "active" },
      }),
    ).toEqual({
      kind: "customer",
      facts: { id: "ctm_1", email: "a@b.test", name: null, status: "active" },
    });
  });

  it("refuses a customer payload without an email", () => {
    expect(() =>
      parsePaddleEvent("customer.created", {
        data: { id: "ctm_1", status: "active" },
      }),
    ).toThrow();
  });

  it("reads a completed transaction's ids", () => {
    const parsed = parsePaddleEvent("transaction.completed", {
      data: { id: "txn_1", customer_id: "ctm_1", subscription_id: "sub_1" },
    });
    expect(parsed).toEqual({
      kind: "transaction",
      customerId: "ctm_1",
      subscriptionId: "sub_1",
      organizationId: null,
    });
  });

  it("shrugs at everything else", () => {
    expect(parsePaddleEvent("payout.paid", { data: {} })).toEqual({
      kind: "other",
    });
  });
});
