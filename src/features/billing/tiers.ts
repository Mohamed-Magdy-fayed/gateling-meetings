import type { mainTranslations } from "@/features/core/i18n/global";
import type { TranslationKey } from "@/features/core/i18n/lib";
import type { BillingInterval, PaidPlanId, PlanCatalog } from "./catalog";

export type { BillingInterval, PaidPlanId };

/** Only parameter-less keys, so the card can render them with a bare `t(key)`. */
type Key = Extract<
  TranslationKey<typeof mainTranslations>,
  `billing.tiers.${string}` | `billing.plans.${string}.tagline`
>;

/**
 * Every paid plan is priced in one currency, in its smallest unit. Paymob
 * Egypt integrations charge EGP, so the pricing page, the checkout amount
 * and the recurring deduction all read the same number from here — the
 * provider is never the source of truth for an amount.
 */
export const BILLING_CURRENCY = "EGP";

/**
 * One card on the pricing page. Copy lives in the translation files (keys
 * here, text in `billing-en.ts` / `billing-ar.ts`), the per-seat amounts
 * here, and the provider's catalog ids in the environment, so this file is
 * the only thing to touch to reorder tiers, change what a card says, move
 * the highlight or change a price.
 */
export interface Tier {
  name: PaidPlanId;
  description: Key;
  features: Key[];
  /** Per seat, per interval, in piastres (1/100 EGP). */
  unitAmountCents: Record<BillingInterval, number>;
  /** The provider's catalog ids; the checkout opens one of them. */
  planId: Record<BillingInterval, string>;
  /** Drawn with the brand border and the primary button. */
  highlighted: boolean;
}

/** Everything about a tier except its catalog ids, which vary by environment. */
export type TierDefinition = Omit<Tier, "planId">;

/** Feature lines are marketing copy; what a plan *enforces* is `PLAN_ENTITLEMENTS`. */
export const TIER_DEFINITIONS: readonly TierDefinition[] = [
  {
    name: "pro",
    description: "billing.plans.pro.tagline",
    features: [
      "billing.tiers.pro.participants",
      "billing.tiers.pro.duration",
      "billing.tiers.pro.scheduling",
      "billing.tiers.pro.breakouts",
      "billing.tiers.pro.seats",
    ],
    // Launch pricing: EGP 149 / seat / month, EGP 1,490 / seat / year.
    unitAmountCents: { month: 149_00, year: 1_490_00 },
    highlighted: true,
  },
  {
    name: "business",
    description: "billing.plans.business.tagline",
    features: [
      "billing.tiers.business.participants",
      "billing.tiers.business.duration",
      "billing.tiers.business.scheduling",
      "billing.tiers.business.breakouts",
      "billing.tiers.business.api",
      "billing.tiers.business.seats",
    ],
    // Launch pricing: EGP 299 / seat / month, EGP 2,990 / seat / year.
    unitAmountCents: { month: 299_00, year: 2_990_00 },
    highlighted: false,
  },
];

export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

/** Per-seat amount for a plan and interval, in the smallest currency unit. */
export function unitAmountCents(
  plan: PaidPlanId,
  interval: BillingInterval,
): number {
  const tier = TIER_DEFINITIONS.find((t) => t.name === plan);
  if (!tier) throw new Error(`unknown plan ${plan}`);
  return tier.unitAmountCents[interval];
}

/** Seats × unit price; what the provider is asked to charge per cycle. */
export function subscriptionAmountCents(
  plan: PaidPlanId,
  interval: BillingInterval,
  seats: number,
): number {
  return unitAmountCents(plan, interval) * Math.max(1, seats);
}

/** The inverse: how many seats a charged amount pays for (never below 1). */
export function seatsForAmount(
  plan: PaidPlanId,
  interval: BillingInterval,
  amountCents: number,
): number {
  return Math.max(1, Math.round(amountCents / unitAmountCents(plan, interval)));
}

/** Joins the static definitions with the environment's catalog ids. */
export function buildTiers(catalog: PlanCatalog): Tier[] {
  return TIER_DEFINITIONS.map((tier) => ({
    ...tier,
    planId: catalog[tier.name],
  }));
}
