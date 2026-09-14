import "server-only";

import { env, isBillingConfigured } from "@/data/env/server";
import type { PlanId } from "@/drizzle/schema";
import { getPaddle } from "@/integrations/paddle/client";

import type { DisplayPrice } from "../price-format";

export type DisplayPrices = Record<Exclude<PlanId, "free">, DisplayPrice>;

const TTL_MS = 10 * 60 * 1000;

let cached: { prices: DisplayPrices; fetchedAt: number } | null = null;
let inflight: Promise<DisplayPrices> | null = null;

async function fetchPrice(priceId: string): Promise<DisplayPrice> {
  const price = await getPaddle().prices.get(priceId);
  return {
    amount: Number(price.unitPrice.amount),
    currencyCode: price.unitPrice.currencyCode,
    interval: price.billingCycle?.interval ?? null,
  };
}

/**
 * The amounts on the pricing cards, read from Paddle's catalog rather than
 * typed into the code: what the page shows is by construction what the
 * checkout charges (Paddle's domain review compares the two). Cached per
 * process for ten minutes; null when billing is not configured or Paddle
 * is unreachable, in which case the cards show features without a number.
 */
export async function getDisplayPrices(): Promise<DisplayPrices | null> {
  if (!isBillingConfigured) return null;
  if (cached && Date.now() - cached.fetchedAt < TTL_MS) return cached.prices;
  try {
    inflight ??= (async () => {
      const [pro, business] = await Promise.all([
        fetchPrice(env.PADDLE_PRICE_ID_PRO as string),
        fetchPrice(env.PADDLE_PRICE_ID_BUSINESS as string),
      ]);
      const prices = { pro, business };
      cached = { prices, fetchedAt: Date.now() };
      return prices;
    })().finally(() => {
      inflight = null;
    });
    return await inflight;
  } catch (error) {
    console.warn("[paddle] could not load catalog prices", error);
    return cached?.prices ?? null;
  }
}
