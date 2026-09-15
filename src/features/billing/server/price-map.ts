import "server-only";

import { env } from "@/data/env/server";
import { createPriceMap, type PriceMap } from "@/integrations/paddle/prices";

/**
 * The catalog ids from the environment, or `null` until all four are set.
 * The one place env names meet plan names, so the router, the webhook and
 * the pricing page cannot disagree about which price is which.
 */
export function getPriceMap(): PriceMap | null {
  return createPriceMap({
    pro: {
      month: env.PADDLE_PRICE_ID_PRO_MONTH,
      year: env.PADDLE_PRICE_ID_PRO_YEAR,
    },
    business: {
      month: env.PADDLE_PRICE_ID_BUSINESS_MONTH,
      year: env.PADDLE_PRICE_ID_BUSINESS_YEAR,
    },
  });
}
