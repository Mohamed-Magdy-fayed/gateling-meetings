import { describe, expect, it } from "vitest";

import {
  catalogIdToPlan,
  catalogIdToPlanAndInterval,
  createPlanCatalog,
  planToCatalogId,
} from "@/features/billing/catalog";
import {
  decideApply,
  PAST_DUE_GRACE_MS,
  type SubscriptionFacts,
  subscriptionAccess,
  subscriptionGrantsAccess,
  subscriptionSeats,
  subscriptionToPlanChange,
} from "@/features/billing/server/subscription-mapping";
import {
  seatsForAmount,
  subscriptionAmountCents,
} from "@/features/billing/tiers";
import {
  normalizeSubscriptionStatus,
  PAYMOB_EVENT_TYPES,
  parsePaymobEvent,
  subscriptionIdFromWebhook,
  subscriptionResponseSchema,
  subscriptionToFacts,
} from "@/integrations/paymob/events";

const catalog = {
  pro: { month: "101", year: "102" },
  business: { month: "201", year: "202" },
} as const;
const NOW = new Date("2026-09-16T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const periodEnd = new Date(NOW.getTime() + 20 * DAY);

const PRO_MONTH_UNIT = subscriptionAmountCents("pro", "month", 1);

function sub(overrides: Partial<SubscriptionFacts> = {}): SubscriptionFacts {
  return {
    id: "5001",
    customerId: null,
    status: "active",
    rawStatus: "active",
    planId: "101",
    quantity: null,
    amountCents: PRO_MONTH_UNIT * 3,
    currency: "EGP",
    currentBillingPeriod: { startsAt: null, endsAt: periodEnd.toISOString() },
    scheduledChange: null,
    canceledAt: null,
    pausedAt: null,
    ...overrides,
  };
}

describe("plan catalog", () => {
  it("is null until all four ids are set", () => {
    expect(
      createPlanCatalog({
        pro: { month: "a", year: "b" },
        business: { month: "c", year: undefined },
      }),
    ).toBeNull();
    expect(
      createPlanCatalog({
        pro: { month: "a", year: "b" },
        business: { month: "c", year: "d" },
      }),
    ).toEqual({
      pro: { month: "a", year: "b" },
      business: { month: "c", year: "d" },
    });
  });
  it("maps ids of either interval to a plan and rejects strangers", () => {
    expect(catalogIdToPlan(catalog, "201")).toBe("business");
    expect(catalogIdToPlan(catalog, "202")).toBe("business");
    expect(catalogIdToPlanAndInterval(catalog, "102")).toEqual({
      plan: "pro",
      interval: "year",
    });
    expect(catalogIdToPlan(catalog, "999")).toBeNull();
    expect(catalogIdToPlan(catalog, null)).toBeNull();
    expect(planToCatalogId(catalog, "pro", "month")).toBe("101");
    expect(planToCatalogId(catalog, "business", "year")).toBe("202");
  });
});

describe("seats from a flat amount", () => {
  it("derives the seat count from the charged amount", () => {
    expect(seatsForAmount("pro", "month", PRO_MONTH_UNIT * 5)).toBe(5);
    expect(subscriptionSeats(sub(), catalog)).toBe(3);
    // A rounding hiccup on the provider side never drops a seat.
    expect(seatsForAmount("pro", "month", PRO_MONTH_UNIT * 5 - 1)).toBe(5);
  });
  it("prefers an explicit quantity and never reports fewer than one seat", () => {
    expect(subscriptionSeats(sub({ quantity: 7 }), catalog)).toBe(7);
    expect(subscriptionSeats(sub({ quantity: 0 }), catalog)).toBe(1);
    expect(subscriptionSeats(sub({ amountCents: 0 }), catalog)).toBe(1);
    expect(subscriptionSeats(sub({ amountCents: null }), catalog)).toBe(1);
  });
});

describe("subscriptionToPlanChange", () => {
  it("recognises a yearly plan as the same tier", () => {
    const change = subscriptionToPlanChange(
      sub({
        planId: "202",
        amountCents: subscriptionAmountCents("business", "year", 2),
      }),
      catalog,
      NOW,
    );
    expect(change).toMatchObject({
      plan: "business",
      seatLimit: 2,
      billingPlanId: "202",
    });
  });
  it("puts an active subscription on its plan with the bought seats", () => {
    const change = subscriptionToPlanChange(sub(), catalog, NOW);
    expect(change).toMatchObject({
      plan: "pro",
      planSource: "subscription",
      seatLimit: 3,
      planExpiresAt: null,
      billingSubscriptionId: "5001",
      billingPlanId: "101",
    });
    expect(change).not.toHaveProperty("billingCustomerId");
    expect(change?.currentPeriodEndsAt?.toISOString()).toBe(
      periodEnd.toISOString(),
    );
  });

  it("carries the customer id only when the provider has one", () => {
    expect(
      subscriptionToPlanChange(sub({ customerId: "ctm_1" }), catalog, NOW),
    ).toMatchObject({ billingCustomerId: "ctm_1" });
  });

  it("treats trialing like active", () => {
    expect(
      subscriptionToPlanChange(sub({ status: "trialing" }), catalog, NOW),
    ).toMatchObject({ plan: "pro", planExpiresAt: null });
  });

  it("gives past_due a grace period after the period end", () => {
    const change = subscriptionToPlanChange(
      sub({ status: "past_due" }),
      catalog,
      NOW,
    );
    expect(change?.plan).toBe("pro");
    expect(change?.planExpiresAt?.getTime()).toBe(
      periodEnd.getTime() + PAST_DUE_GRACE_MS,
    );
  });

  it("drops a paused subscription to free but keeps its id", () => {
    const change = subscriptionToPlanChange(
      sub({ status: "paused", pausedAt: NOW.toISOString() }),
      catalog,
      NOW,
    );
    expect(change).toMatchObject({
      plan: "free",
      planSource: "free",
      seatLimit: 1,
      billingSubscriptionId: "5001",
      billingSubscriptionStatus: "paused",
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
      catalog,
      NOW,
    );
    expect(change).toMatchObject({ plan: "pro", planExpiresAt: null });
  });

  it("keeps a cancelled-but-paid-up plan until the period ends", () => {
    const change = subscriptionToPlanChange(
      sub({ status: "canceled" }),
      catalog,
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
      catalog,
      NOW,
    );
    expect(change).toMatchObject({
      plan: "free",
      planSource: "free",
      seatLimit: 1,
      billingSubscriptionId: null,
    });
  });

  it("ignores a subscription on a plan that is not ours", () => {
    expect(
      subscriptionToPlanChange(sub({ planId: "999" }), catalog, NOW),
    ).toBeNull();
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
    expect(
      subscriptionGrantsAccess(sub({ status: "canceled" }), periodEnd),
    ).toBe(false);
  });
});

describe("decideApply", () => {
  it("never overwrites a hand-granted or trial plan", () => {
    expect(
      decideApply({ planSource: "manual", billingSyncedAt: null }, NOW),
    ).toEqual({ apply: false, reason: "skipped_manual" });
    expect(
      decideApply({ planSource: "trial", billingSyncedAt: null }, NOW),
    ).toEqual({ apply: false, reason: "skipped_manual" });
  });

  it("drops an event older than the last one applied", () => {
    expect(
      decideApply(
        { planSource: "subscription", billingSyncedAt: NOW },
        new Date(NOW.getTime() - 1),
      ),
    ).toEqual({ apply: false, reason: "skipped_stale" });
  });

  it("applies fresh events to free and subscription orgs", () => {
    expect(
      decideApply({ planSource: "free", billingSyncedAt: null }, NOW),
    ).toEqual({ apply: true });
    expect(
      decideApply({ planSource: "subscription", billingSyncedAt: NOW }, NOW),
    ).toEqual({ apply: true });
  });
});

describe("Paymob subscription → facts", () => {
  it("normalises the states Paymob uses and falls back to timestamps", () => {
    expect(
      normalizeSubscriptionStatus(
        { state: "Active", suspended_at: null, ends_at: null },
        NOW,
      ),
    ).toBe("active");
    expect(
      normalizeSubscriptionStatus(
        { state: "suspended", suspended_at: null, ends_at: null },
        NOW,
      ),
    ).toBe("paused");
    expect(
      normalizeSubscriptionStatus(
        { state: "cancelled", suspended_at: null, ends_at: null },
        NOW,
      ),
    ).toBe("canceled");
    expect(
      normalizeSubscriptionStatus(
        {
          state: "something_new",
          suspended_at: NOW.toISOString(),
          ends_at: null,
        },
        NOW,
      ),
    ).toBe("paused");
    expect(
      normalizeSubscriptionStatus(
        {
          state: "something_new",
          suspended_at: null,
          ends_at: new Date(NOW.getTime() - DAY).toISOString(),
        },
        NOW,
      ),
    ).toBe("canceled");
  });

  it("reads the next deduction as the period end and a future end as a scheduled cancel", () => {
    const facts = subscriptionToFacts(
      subscriptionResponseSchema.parse({
        id: 5001,
        state: "active",
        plan_id: 101,
        amount_cents: PRO_MONTH_UNIT * 3,
        starts_at: NOW.toISOString(),
        next_billing: periodEnd.toISOString(),
        ends_at: periodEnd.toISOString(),
      }),
      NOW,
    );
    expect(facts).toMatchObject({
      id: "5001",
      status: "active",
      rawStatus: "active",
      planId: "101",
      quantity: null,
      amountCents: PRO_MONTH_UNIT * 3,
      currency: "EGP",
      currentBillingPeriod: {
        startsAt: NOW.toISOString(),
        endsAt: periodEnd.toISOString(),
      },
      scheduledChange: {
        action: "cancel",
        effectiveAt: periodEnd.toISOString(),
      },
    });
    expect(subscriptionToPlanChange(facts, catalog, NOW)).toMatchObject({
      plan: "pro",
      seatLimit: 3,
      planExpiresAt: null,
    });
  });

  it("finds the subscription id wherever the plan webhook puts it", () => {
    expect(subscriptionIdFromWebhook({ id: 7 })).toBe("7");
    expect(
      subscriptionIdFromWebhook({ obj: { id: "8", state: "active" } }),
    ).toBe("8");
    expect(subscriptionIdFromWebhook({ subscription_id: 9 })).toBe("9");
    expect(
      subscriptionIdFromWebhook({ type: "TRANSACTION", obj: { foo: 1 } }),
    ).toBeNull();
  });
});

describe("parsePaymobEvent", () => {
  const transaction = {
    type: "TRANSACTION",
    obj: {
      id: 123456,
      pending: false,
      success: true,
      amount_cents: PRO_MONTH_UNIT * 3,
      currency: "EGP",
      created_at: NOW.toISOString(),
      is_refunded: false,
      is_voided: false,
      order: { id: 987, merchant_order_id: "bc_abc" },
      source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
      payment_key_claims: { billing_data: { email: "a@b.test" } },
    },
  };

  it("reads the processed transaction callback", () => {
    expect(
      parsePaymobEvent(PAYMOB_EVENT_TYPES.transaction, transaction),
    ).toEqual({
      kind: "transaction",
      transactionId: "123456",
      providerOrderId: "987",
      reference: "bc_abc",
      success: true,
      pending: false,
      amountCents: PRO_MONTH_UNIT * 3,
      currency: "EGP",
      subscriptionId: null,
      email: "a@b.test",
    });
  });

  it("treats a pending transaction as not (yet) successful", () => {
    const parsed = parsePaymobEvent(PAYMOB_EVENT_TYPES.transaction, {
      ...transaction,
      obj: { ...transaction.obj, pending: true, success: true },
    });
    expect(parsed).toMatchObject({ success: false, pending: true });
  });

  it("picks up a subscription id from a recurring deduction", () => {
    const parsed = parsePaymobEvent(PAYMOB_EVENT_TYPES.transaction, {
      ...transaction,
      obj: {
        ...transaction.obj,
        order: { id: 988, merchant_order_id: null, subscription_id: 5001 },
      },
    });
    expect(parsed).toMatchObject({ subscriptionId: "5001", reference: null });
  });

  it("reads a card token callback as a saved card", () => {
    expect(
      parsePaymobEvent(PAYMOB_EVENT_TYPES.token, {
        type: "TOKEN",
        obj: {
          id: 15978654,
          token: "3f22ce8a",
          masked_pan: "xxxx-xxxx-xxxx-2346",
          merchant_id: 1,
          card_subtype: "MasterCard",
          created_at: NOW.toISOString(),
          email: "a@b.test",
          order_id: "987",
        },
      }),
    ).toEqual({
      kind: "customer",
      facts: {
        id: "15978654",
        email: "a@b.test",
        name: null,
        status: "active",
        card: {
          token: "3f22ce8a",
          maskedPan: "xxxx-xxxx-xxxx-2346",
          brand: "MasterCard",
        },
      },
      providerOrderId: "987",
    });
  });

  it("turns the plan webhook into a re-read, never a trusted snapshot", () => {
    expect(
      parsePaymobEvent(PAYMOB_EVENT_TYPES.subscription, {
        obj: { id: 5001, state: "canceled" },
      }),
    ).toEqual({ kind: "subscription_ref", subscriptionId: "5001" });
    expect(parsePaymobEvent(PAYMOB_EVENT_TYPES.subscription, {})).toEqual({
      kind: "other",
    });
  });

  it("shrugs at everything else", () => {
    expect(parsePaymobEvent("paymob.something", { obj: {} })).toEqual({
      kind: "other",
    });
  });
});
