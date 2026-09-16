import "server-only";

import { env } from "@/data/env/server";
import { createPlanCatalog, type PlanCatalog } from "../catalog";

/**
 * The provider's catalog ids from the environment, or `null` until all
 * four are set. The one place env names meet plan names, so the router,
 * the webhook and the pricing page cannot disagree about which id is which.
 */
export function getPlanCatalog(): PlanCatalog | null {
  if (env.BILLING_PROVIDER !== "paymob") return null;
  return createPlanCatalog({
    pro: {
      month: env.PAYMOB_PLAN_ID_PRO_MONTH,
      year: env.PAYMOB_PLAN_ID_PRO_YEAR,
    },
    business: {
      month: env.PAYMOB_PLAN_ID_BUSINESS_MONTH,
      year: env.PAYMOB_PLAN_ID_BUSINESS_YEAR,
    },
  });
}
