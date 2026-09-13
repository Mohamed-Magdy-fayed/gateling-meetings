import type { PlanId } from "@/drizzle/schema";

/** Paddle price id per paid plan; free has none. */
export type PriceMap = Record<Exclude<PlanId, "free">, string>;

export function createPriceMap(ids: {
  pro: string | undefined;
  business: string | undefined;
}): PriceMap | null {
  if (!ids.pro || !ids.business) return null;
  return { pro: ids.pro, business: ids.business };
}

export function priceIdToPlan(
  map: PriceMap,
  priceId: string | null | undefined,
): Exclude<PlanId, "free"> | null {
  if (!priceId) return null;
  if (priceId === map.pro) return "pro";
  if (priceId === map.business) return "business";
  return null;
}

export function planToPriceId(
  map: PriceMap,
  plan: Exclude<PlanId, "free">,
): string {
  return map[plan];
}
