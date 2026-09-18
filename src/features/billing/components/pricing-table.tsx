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
import type { PlanId } from "@/drizzle/schema";
import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";
import {
  BILLING_CURRENCY,
  BILLING_INTERVALS,
  type BillingInterval,
  type Tier,
} from "../tiers";
import { formatMoney } from "./format-money";
import { PricingCta } from "./pricing-cta";

type PricingTableProps = {
  tiers: Tier[];
  /** The viewer's current plan, if signed in. */
  currentPlan: PlanId | null;
  isSignedIn: boolean;
  /** Owner/admin of a billable org, with billing configured. */
  canCheckout: boolean;
};

/**
 * Two paid tiers, priced per seat in EGP from `tiers.ts` — the same number
 * the checkout charges, so the card is by construction what the payment
 * page shows.
 */
export function PricingTable({
  tiers,
  currentPlan,
  isSignedIn,
  canCheckout,
}: PricingTableProps) {
  const { t, locale } = useTranslation();
  const [interval, setInterval] = useState<BillingInterval>("month");

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
          const formatted = formatMoney(
            tier.unitAmountCents[interval],
            BILLING_CURRENCY,
            locale,
          );
          return (
            <Card
              key={tier.name}
              className={cn(
                "relative flex flex-col",
                tier.highlighted && "border-primary",
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
                  <span
                    data-testid="tier-price"
                    className="font-display text-3xl tracking-tight"
                  >
                    {formatted}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {t(`billing.pricing.perSeat.${interval}`)}
                  </span>
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
      <p className="text-center text-xs text-muted-foreground">
        {t("billing.pricing.currencyNote")}
      </p>
    </div>
  );
}
