import type { PlanId } from "@/drizzle/schema";

export type PaidPlanId = Exclude<PlanId, "free">;
export type BillingInterval = "month" | "year";

/** Paddle price ids per paid plan and billing interval; free has none. */
export type PriceMap = Record<PaidPlanId, Record<BillingInterval, string>>;

type PriceIdInput = { month: string | undefined; year: string | undefined };

export function createPriceMap(ids: {
  pro: PriceIdInput;
  business: PriceIdInput;
}): PriceMap | null {
  if (
    !ids.pro.month ||
    !ids.pro.year ||
    !ids.business.month ||
    !ids.business.year
  ) {
    return null;
  }
  return {
    pro: { month: ids.pro.month, year: ids.pro.year },
    business: { month: ids.business.month, year: ids.business.year },
  };
}

/** Which plan a Paddle price belongs to, whatever its interval. */
export function priceIdToPlan(
  map: PriceMap,
  priceId: string | null | undefined,
): PaidPlanId | null {
  if (!priceId) return null;
  if (priceId === map.pro.month || priceId === map.pro.year) return "pro";
  if (priceId === map.business.month || priceId === map.business.year) {
    return "business";
  }
  return null;
}

export function planToPriceId(
  map: PriceMap,
  plan: PaidPlanId,
  interval: BillingInterval,
): string {
  return map[plan][interval];
}
