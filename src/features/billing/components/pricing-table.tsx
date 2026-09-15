"use client";

import { CheckIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import type { PlanId } from "@/drizzle/schema";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import { BILLING_INTERVALS, type BillingInterval, type Tier } from "../tiers";
import { usePaddle } from "./paddle-provider";
import { PricingCta } from "./pricing-cta";
import { usePaddlePrices } from "./use-paddle-prices";

type PricingTableProps = {
  tiers: Tier[];
  /** ISO 3166-1 alpha-2 from the CDN, or undefined to let Paddle infer it. */
  countryCode: string | undefined;
  /** The viewer's current plan, if signed in. */
  currentPlan: PlanId | null;
  isSignedIn: boolean;
  /** Owner/admin of a billable org, with Paddle configured. */
  canCheckout: boolean;
};

/**
 * Two paid tiers, priced by Paddle for the visitor's country. The amount
 * on a card is the string `PricePreview` returned — never computed or
 * re-formatted here — so it is by construction what the checkout charges.
 */
export function PricingTable({
  tiers,
  countryCode,
  currentPlan,
  isSignedIn,
  canCheckout,
}: PricingTableProps) {
  const { t } = useTranslation();
  const paddle = usePaddle();
  const [interval, setInterval] = useState<BillingInterval>("month");
  const { status, prices } = usePaddlePrices(paddle, tiers, countryCode);

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <SegmentedControl
          value={interval}
          onValueChange={(value) => setInterval(value as BillingInterval)}
          options={BILLING_INTERVALS.map((value) => ({
            value,
            label: t(`billing.pricing.interval.${value}`),
          }))}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {tiers.map((tier) => {
          const isCurrent = currentPlan === tier.name;
          const priceId = tier.priceId[interval];
          const formatted = prices[priceId];
          return (
            <Card
              key={tier.name}
              className={cn(
                "relative flex flex-col",
                tier.highlighted &&
                  "border-primary shadow-[var(--shadow-brand-sm)]",
              )}
            >
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="font-display text-lg">
                    {t(`billing.plans.${tier.name}.name`)}
                  </CardTitle>
                  {isCurrent && (
                    <Badge variant="info">{t("billing.pricing.current")}</Badge>
                  )}
                </div>
                <CardDescription>{t(tier.description)}</CardDescription>
                <div className="flex items-baseline gap-1.5 pt-2">
                  {formatted ? (
                    <span
                      data-testid="tier-price"
                      className="font-display text-3xl tracking-tight"
                    >
                      {formatted}
                    </span>
                  ) : status === "error" ? (
                    <span className="text-sm text-muted-foreground">
                      {t("billing.pricing.unavailable")}
                    </span>
                  ) : (
                    <Skeleton className="h-9 w-24" />
                  )}
                  {formatted && (
                    <span className="text-sm text-muted-foreground">
                      {t(`billing.pricing.perSeat.${interval}`)}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <ul className="space-y-2 text-sm">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{t(feature)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <PricingCta
                  plan={tier.name}
                  interval={interval}
                  highlighted={tier.highlighted}
                  isCurrent={isCurrent}
                  isSignedIn={isSignedIn}
                  canCheckout={canCheckout}
                />
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
