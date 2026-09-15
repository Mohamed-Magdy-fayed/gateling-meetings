import type { mainTranslations } from "@/features/core/i18n/global";
import type { TranslationKey } from "@/features/core/i18n/lib";
import type {
  BillingInterval,
  PaidPlanId,
  PriceMap,
} from "@/integrations/paddle/prices";

export type { BillingInterval, PaidPlanId };

/** Only parameter-less keys, so the card can render them with a bare `t(key)`. */
type Key = Extract<
  TranslationKey<typeof mainTranslations>,
  `billing.tiers.${string}` | `billing.plans.${string}.tagline`
>;

/**
 * One card on the pricing page. Copy lives in the translation files (keys
 * here, text in `billing-en.ts` / `billing-ar.ts`) and the Paddle price ids
 * in the environment, so this file is the only thing to touch to reorder
 * tiers, change what a card says, or move the highlight.
 */
export interface Tier {
  name: PaidPlanId;
  description: Key;
  features: Key[];
  /** Paddle `pri_…` ids; the pricing page previews both, checkout opens one. */
  priceId: Record<BillingInterval, string>;
  /** Drawn with the brand border and the primary button. */
  highlighted: boolean;
}

/** Everything about a tier except its price ids, which vary by environment. */
export type TierDefinition = Omit<Tier, "priceId">;

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
    highlighted: false,
  },
];

export const BILLING_INTERVALS: readonly BillingInterval[] = ["month", "year"];

/** Joins the static definitions with the environment's price ids. */
export function buildTiers(prices: PriceMap): Tier[] {
  return TIER_DEFINITIONS.map((tier) => ({
    ...tier,
    priceId: prices[tier.name],
  }));
}
