import type { PlanId } from "@/drizzle/schema";

/** The plans with a price: `free` costs nothing and `unlimited` is comp-only. */
export type PaidPlanId = Extract<PlanId, "pro" | "business">;
export type BillingInterval = "month" | "year";

/**
 * The provider's catalog ids per paid plan and billing interval; free has
 * none. Which entity the id names is the provider's business (a Paymob
 * subscription plan, a Paddle price, …) — the app only ever maps it to and
 * from a plan name here.
 */
export type PlanCatalog = Record<PaidPlanId, Record<BillingInterval, string>>;

type CatalogIdInput = { month: string | undefined; year: string | undefined };

export function createPlanCatalog(ids: {
  pro: CatalogIdInput;
  business: CatalogIdInput;
}): PlanCatalog | null {
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

/** Which plan a catalog id belongs to, whatever its interval. */
export function catalogIdToPlan(
  catalog: PlanCatalog,
  catalogId: string | null | undefined,
): PaidPlanId | null {
  return catalogIdToPlanAndInterval(catalog, catalogId)?.plan ?? null;
}

/** Plan *and* interval for a catalog id, or `null` when it is not ours. */
export function catalogIdToPlanAndInterval(
  catalog: PlanCatalog,
  catalogId: string | null | undefined,
): { plan: PaidPlanId; interval: BillingInterval } | null {
  if (!catalogId) return null;
  for (const plan of ["pro", "business"] as const) {
    for (const interval of ["month", "year"] as const) {
      if (catalog[plan][interval] === catalogId) return { plan, interval };
    }
  }
  return null;
}

export function planToCatalogId(
  catalog: PlanCatalog,
  plan: PaidPlanId,
  interval: BillingInterval,
): string {
  return catalog[plan][interval];
}
