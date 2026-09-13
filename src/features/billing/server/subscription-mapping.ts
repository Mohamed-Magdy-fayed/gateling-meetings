import type { Organization, PlanId, PlanSource } from "@/drizzle/schema";
import { type PriceMap, priceIdToPlan } from "@/integrations/paddle/prices";

/**
 * The slice of a Paddle subscription this module reads. Narrow on purpose
 * so the mapping is unit-tested with plain objects, not SDK entities.
 */
export type SubscriptionFacts = {
  id: string;
  customerId: string;
  status: "active" | "trialing" | "past_due" | "paused" | "canceled";
  items: { priceId: string | null; quantity: number }[];
  currentBillingPeriod: { endsAt: string } | null;
  scheduledChange: { action: string; effectiveAt: string } | null;
};

/** What to write on the org, or `null` when the subscription is not ours. */
export type PlanChange = {
  plan: PlanId;
  planSource: Extract<PlanSource, "subscription" | "free">;
  seatLimit: number;
  planExpiresAt: Date | null;
  paddleCustomerId: string;
  paddleSubscriptionId: string | null;
  paddleSubscriptionStatus: string;
  paddlePriceId: string | null;
  currentPeriodEndsAt: Date | null;
};

/** How long a `past_due` org keeps its plan while Paddle retries the card. */
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Paddle subscription → what the org is entitled to and until when. Every
 * status maps to "keep the plan until instant X" or "free now"; the instant
 * is then enforced by `resolveEntitlements` on read, so nothing here needs
 * a follow-up job to flip a row later.
 */
export function subscriptionToPlanChange(
  sub: SubscriptionFacts,
  prices: PriceMap,
  now: Date = new Date(),
): PlanChange | null {
  const item = sub.items.find((i) => priceIdToPlan(prices, i.priceId));
  const plan = item ? priceIdToPlan(prices, item.priceId) : null;
  if (!plan || !item) return null;

  const base = {
    paddleCustomerId: sub.customerId,
    paddleSubscriptionId: sub.id,
    paddleSubscriptionStatus: sub.status,
    paddlePriceId: item.priceId,
    currentPeriodEndsAt: toDate(sub.currentBillingPeriod?.endsAt),
  };
  const periodEnd = toDate(sub.currentBillingPeriod?.endsAt);
  const seatLimit = Math.max(1, item.quantity);
  const keep = (planExpiresAt: Date | null): PlanChange => ({
    ...base,
    plan,
    planSource: "subscription",
    seatLimit,
    planExpiresAt,
  });

  switch (sub.status) {
    case "active":
    case "trialing":
      return keep(null);
    case "past_due":
      // Paddle retries for a while; a card hiccup should not lock a team
      // out of a meeting mid-week.
      return keep(new Date((periodEnd ?? now).getTime() + PAST_DUE_GRACE_MS));
    case "paused":
      return keep(toDate(sub.scheduledChange?.effectiveAt) ?? now);
    case "canceled": {
      const effectiveAt =
        toDate(sub.scheduledChange?.effectiveAt) ?? periodEnd ?? now;
      if (effectiveAt.getTime() <= now.getTime()) {
        return {
          ...base,
          plan: "free",
          planSource: "free",
          seatLimit: 1,
          planExpiresAt: null,
          paddleSubscriptionId: null,
        };
      }
      // Paid through the end of the period; drops to free by itself then.
      return keep(effectiveAt);
    }
  }
}

export type ApplyDecision =
  | { apply: true }
  | { apply: false; reason: "skipped_manual" | "skipped_stale" };

/**
 * Whether a change may land on this org. A hand-granted or trial plan is
 * never overwritten by billing (an admin decided that; a stray webhook
 * must not undo it), and an event older than the last one applied is
 * ignored so out-of-order delivery cannot regress the row.
 */
export function decideApply(
  org: Pick<Organization, "planSource" | "paddleSyncedAt">,
  occurredAt: Date,
): ApplyDecision {
  if (org.planSource === "manual" || org.planSource === "trial") {
    return { apply: false, reason: "skipped_manual" };
  }
  if (
    org.paddleSyncedAt &&
    occurredAt.getTime() < org.paddleSyncedAt.getTime()
  ) {
    return { apply: false, reason: "skipped_stale" };
  }
  return { apply: true };
}
