"use client";

import type {
  Paddle,
  PricePreviewParams,
  PricePreviewResponse,
} from "@paddle/paddle-js";
import { useEffect, useState } from "react";

import type { Tier } from "../tiers";

/** `pri_…` → the string Paddle formatted for the visitor ("$3.00", "€2,80"). */
export type PaddlePrices = Record<string, string>;

type State =
  | { status: "loading"; prices: PaddlePrices }
  | { status: "ready"; prices: PaddlePrices }
  | { status: "error"; prices: PaddlePrices };

/** Per seat, so the card shows the unit price; checkout sets the seat count. */
function lineItems(priceIds: string[]): PricePreviewParams["items"] {
  return priceIds.map((priceId) => ({ priceId, quantity: 1 }));
}

function toPrices(response: PricePreviewResponse): PaddlePrices {
  return Object.fromEntries(
    response.data.details.lineItems.map((item) => [
      item.price.id,
      // Already localized and formatted by Paddle; shown as-is, never
      // re-parsed or re-rounded, so the card matches the checkout exactly.
      item.formattedTotals.total,
    ]),
  );
}

/**
 * Localized totals for every tier and interval in one `PricePreview` call.
 * `countryCode` comes from the server (CDN geo header); when it is absent
 * no address is sent and Paddle localizes from the visitor's IP itself.
 * Re-fetches only when the country or the tiers change — a monthly/yearly
 * toggle just picks a different key from the same response.
 */
export function usePaddlePrices(
  paddle: Paddle | null,
  tiers: Tier[],
  countryCode: string | undefined,
): State {
  const [state, setState] = useState<State>({
    status: "loading",
    prices: {},
  });
  // A string, so a re-rendered (but identical) tiers array does not refetch.
  const priceIdKey = tiers
    .flatMap((tier) => [tier.priceId.month, tier.priceId.year])
    .join(",");

  useEffect(() => {
    if (!paddle) return;
    let cancelled = false;
    setState((prev) => ({ status: "loading", prices: prev.prices }));
    paddle
      .PricePreview({
        items: lineItems(priceIdKey.split(",")),
        ...(countryCode ? { address: { countryCode } } : {}),
      })
      .then((response) => {
        if (cancelled) return;
        setState({ status: "ready", prices: toPrices(response) });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[paddle] price preview failed", error);
        setState((prev) => ({ status: "error", prices: prev.prices }));
      });
    return () => {
      cancelled = true;
    };
  }, [paddle, priceIdKey, countryCode]);

  return state;
}
