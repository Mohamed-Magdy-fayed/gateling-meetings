import { describe, expect, it } from "vitest";

import { parsePaddleEvent } from "@/features/billing/server/paddle-events";
import {
  decideApply,
  PAST_DUE_GRACE_MS,
  type SubscriptionFacts,
  subscriptionToPlanChange,
} from "@/features/billing/server/subscription-mapping";
import {
  createPriceMap,
  planToPriceId,
  priceIdToPlan,
} from "@/integrations/paddle/prices";

const prices = { pro: "pri_pro", business: "pri_biz" } as const;
const NOW = new Date("2026-09-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const periodEnd = new Date(NOW.getTime() + 20 * DAY);

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    id: "sub_1",
    customerId: "ctm_1",
    status: "active",
    items: [{ priceId: "pri_pro", quantity: 3 }],
    currentBillingPeriod: { endsAt: periodEnd.toISOString() },
    scheduledChange: null,
    ...overrides,
  };
}

describe("price map", () => {
  it("is null until both ids are set", () => {
    expect(createPriceMap({ pro: "a", business: undefined })).toBeNull();
  });
  it("maps ids both ways and rejects strangers", () => {
    expect(priceIdToPlan(prices, "pri_biz")).toBe("business");
    expect(priceIdToPlan(prices, "pri_other")).toBeNull();
    expect(priceIdToPlan(prices, null)).toBeNull();
    expect(planToPriceId(prices, "pro")).toBe("pri_pro");
  });
});

describe("subscriptionToPlanChange", () => {
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

  it("keeps a paused plan until the scheduled instant, else now", () => {
    const resumeAt = new Date(NOW.getTime() + 5 * DAY).toISOString();
    expect(
      subscriptionToPlanChange(
        sub({
          status: "paused",
          scheduledChange: { action: "pause", effectiveAt: resumeAt },
        }),
        prices,
        NOW,
      )?.planExpiresAt?.toISOString(),
    ).toBe(resumeAt);
    expect(
      subscriptionToPlanChange(sub({ status: "paused" }), prices, NOW)
        ?.planExpiresAt,
    ).toEqual(NOW);
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
        sub({ items: [{ priceId: "pri_stranger", quantity: 1 }] }),
        prices,
        NOW,
      ),
    ).toBeNull();
  });

  it("never reports fewer than one seat", () => {
    expect(
      subscriptionToPlanChange(
        sub({ items: [{ priceId: "pri_biz", quantity: 0 }] }),
        prices,
        NOW,
      )?.seatLimit,
    ).toBe(1);
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
        items: [{ quantity: 4, price: { id: "pri_biz" } }],
        current_billing_period: { ends_at: periodEnd.toISOString() },
        scheduled_change: null,
        custom_data: { organizationId: "3b241101-e2bb-4255-8caf-4136c566a962" },
      },
    });
    expect(parsed.kind).toBe("subscription");
    if (parsed.kind !== "subscription") throw new Error("unreachable");
    expect(parsed.facts.items[0]).toEqual({ priceId: "pri_biz", quantity: 4 });
    expect(parsed.organizationId).toBe("3b241101-e2bb-4255-8caf-4136c566a962");
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
