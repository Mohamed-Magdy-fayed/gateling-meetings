import type {
  BillingSubscriptionStatus,
  Organization,
  PlanId,
  PlanSource,
} from "@/drizzle/schema";
import { catalogIdToPlanAndInterval, type PlanCatalog } from "../catalog";
import { seatsForAmount } from "../tiers";

/**
 * The provider-neutral slice of a subscription this module reads. Each
 * adapter normalises its provider's entity into this shape, so the
 * mapping is unit-tested with plain objects and never sees an SDK type.
 */
export type SubscriptionFacts = {
  id: string;
  customerId: string | null;
  status: BillingSubscriptionStatus;
  /** The provider's own state string, for the mirror and the admin page. */
  rawStatus: string | null;
  /** The catalog id (plan × interval) the subscription is on. */
  planId: string | null;
  /**
   * Seats when the provider bills by quantity; `null` when it bills a flat
   * amount and the seat count must be derived from `amountCents`.
   */
  quantity: number | null;
  /** What is charged per cycle, in the smallest unit of `currency`. */
  amountCents: number | null;
  currency: string | null;
  currentBillingPeriod: { startsAt: string | null; endsAt: string } | null;
  scheduledChange: { action: string; effectiveAt: string } | null;
  canceledAt: string | null;
  pausedAt: string | null;
};

/** The slice of a customer / saved card that is mirrored. */
export type CustomerFacts = {
  id: string;
  email: string;
  name: string | null;
  status: "active" | "archived";
  card: { token: string; maskedPan: string; brand: string | null } | null;
};

/** What to write on the org, or `null` when the subscription is not ours. */
export type PlanChange = {
  plan: PlanId;
  planSource: Extract<PlanSource, "subscription" | "free">;
  seatLimit: number;
  planExpiresAt: Date | null;
  /** Omitted (not nulled) when the provider has no customer entity. */
  billingCustomerId?: string | null;
  billingSubscriptionId: string | null;
  billingSubscriptionStatus: string;
  billingPlanId: string | null;
  currentPeriodEndsAt: Date | null;
};

/** How long a `past_due` org keeps its plan while the provider retries the card. */
export const PAST_DUE_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

export function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Whether a subscription pays for access, and until when. `until: null`
 * means "for as long as the provider keeps it in this status" — the next
 * event decides, not a clock.
 */
export type AccessVerdict =
  | { granted: true; until: Date | null }
  | { granted: false };

/**
 * The one place the status → access rule lives. Read it as: which
 * statuses are paid for, and what a paid-for status is worth in time.
 *
 * - `active` / `trialing` grant access. A `scheduledChange` (a cancel or
 *   pause queued for the period end) does NOT revoke anything: the
 *   customer paid through the period, and the provider reports the new
 *   status when the change actually lands.
 * - `past_due` keeps access for a grace period past the period end while
 *   the provider retries the card; a card hiccup should not lock a team
 *   out of a meeting mid-week.
 * - `paused` grants nothing. By the time this status is reported the
 *   pause has taken effect and billing has stopped; a scheduled `resume`
 *   is when access returns, not when it ends.
 * - `canceled` grants nothing once the cancellation is effective. A
 *   cancellation still in its notice period keeps access until then.
 */
export function subscriptionAccess(
  sub: Pick<
    SubscriptionFacts,
    "status" | "currentBillingPeriod" | "scheduledChange"
  >,
  now: Date = new Date(),
): AccessVerdict {
  const periodEnd = toDate(sub.currentBillingPeriod?.endsAt);
  switch (sub.status) {
    case "active":
    case "trialing":
      return { granted: true, until: null };
    case "past_due":
      return {
        granted: true,
        until: new Date((periodEnd ?? now).getTime() + PAST_DUE_GRACE_MS),
      };
    case "paused":
      return { granted: false };
    case "canceled": {
      const effectiveAt =
        toDate(sub.scheduledChange?.effectiveAt) ?? periodEnd ?? now;
      if (effectiveAt.getTime() <= now.getTime()) return { granted: false };
      return { granted: true, until: effectiveAt };
    }
  }
}

/** `true` when the subscription pays for access at `now`. */
export function subscriptionGrantsAccess(
  sub: Parameters<typeof subscriptionAccess>[0],
  now: Date = new Date(),
): boolean {
  const verdict = subscriptionAccess(sub, now);
  if (!verdict.granted) return false;
  return verdict.until == null || verdict.until.getTime() > now.getTime();
}

/**
 * Seats a subscription pays for: the provider's quantity when it bills
 * per unit, else derived from the charged amount and our unit price.
 */
export function subscriptionSeats(
  sub: Pick<SubscriptionFacts, "planId" | "quantity" | "amountCents">,
  catalog: PlanCatalog,
): number {
  if (sub.quantity != null) return Math.max(1, sub.quantity);
  const entry = catalogIdToPlanAndInterval(catalog, sub.planId);
  if (!entry || sub.amountCents == null) return 1;
  return seatsForAmount(entry.plan, entry.interval, sub.amountCents);
}

/**
 * Provider subscription → what the org is entitled to and until when. Every
 * status maps to "keep the plan until instant X" or "free now"; the instant
 * is then enforced by `resolveEntitlements` on read, so nothing here needs
 * a follow-up job to flip a row later.
 */
export function subscriptionToPlanChange(
  sub: SubscriptionFacts,
  catalog: PlanCatalog,
  now: Date = new Date(),
): PlanChange | null {
  const entry = catalogIdToPlanAndInterval(catalog, sub.planId);
  if (!entry) return null;

  const base = {
    ...(sub.customerId ? { billingCustomerId: sub.customerId } : {}),
    billingSubscriptionId: sub.id,
    billingSubscriptionStatus: sub.status,
    billingPlanId: sub.planId,
    currentPeriodEndsAt: toDate(sub.currentBillingPeriod?.endsAt),
  };

  const access = subscriptionAccess(sub, now);
  if (!access.granted) {
    return {
      ...base,
      plan: "free",
      planSource: "free",
      seatLimit: 1,
      planExpiresAt: null,
      // A canceled subscription is gone for good, so the org may check out
      // again. A paused one is resumed by the provider, not re-bought.
      billingSubscriptionId: sub.status === "canceled" ? null : sub.id,
    };
  }
  return {
    ...base,
    plan: entry.plan,
    planSource: "subscription",
    seatLimit: subscriptionSeats(sub, catalog),
    planExpiresAt: access.until,
  };
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
  org: Pick<Organization, "planSource" | "billingSyncedAt">,
  occurredAt: Date,
): ApplyDecision {
  if (org.planSource === "manual" || org.planSource === "trial") {
    return { apply: false, reason: "skipped_manual" };
  }
  if (
    org.billingSyncedAt &&
    occurredAt.getTime() < org.billingSyncedAt.getTime()
  ) {
    return { apply: false, reason: "skipped_stale" };
  }
  return { apply: true };
}
