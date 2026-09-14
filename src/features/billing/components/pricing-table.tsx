import { CheckIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type PlanId, planValues } from "@/drizzle/schema";
import { type Entitlements, PLAN_ENTITLEMENTS } from "@/features/billing/plans";
import { formatDisplayPrice } from "@/features/billing/price-format";
import { getDisplayPrices } from "@/features/billing/server/catalog";
import { getLocaleCookie, getT } from "@/features/core/i18n/server";
import { cn } from "@/lib/utils";
import { PricingCta } from "./pricing-cta";

type PricingTableProps = {
  /** The viewer's current plan, if signed in. */
  currentPlan: PlanId | null;
  isSignedIn: boolean;
  /** Owner/admin of a billable org, with Paddle configured. */
  canCheckout: boolean;
};

const HIGHLIGHTED: PlanId = "pro";

/**
 * Rendered from `PLAN_ENTITLEMENTS` so the page can never drift from what
 * the server enforces, and priced from Paddle's catalog so it cannot drift
 * from what the checkout charges either.
 */
export async function PricingTable({
  currentPlan,
  isSignedIn,
  canCheckout,
}: PricingTableProps) {
  const [{ t }, locale, prices] = await Promise.all([
    getT(),
    getLocaleCookie(),
    getDisplayPrices(),
  ]);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {planValues.map((plan) => {
        const e = PLAN_ENTITLEMENTS[plan];
        const isCurrent = currentPlan === plan;
        const highlighted = plan === HIGHLIGHTED;
        const price = plan === "free" ? null : prices?.[plan];
        return (
          <Card
            key={plan}
            className={cn(
              "relative flex flex-col",
              highlighted && "border-primary shadow-[var(--shadow-brand-sm)]",
            )}
          >
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="font-display text-lg">
                  {t(`billing.plans.${plan}.name`)}
                </CardTitle>
                {isCurrent && (
                  <Badge variant="info">{t("billing.pricing.current")}</Badge>
                )}
              </div>
              <CardDescription>
                {t(`billing.plans.${plan}.tagline`)}
              </CardDescription>
              <p className="flex items-baseline gap-1.5 pt-2">
                {price && (
                  <span className="font-display text-3xl tracking-tight">
                    {formatDisplayPrice(price, locale)}
                  </span>
                )}
                <span className="text-sm text-muted-foreground">
                  {plan === "free"
                    ? t("billing.pricing.free")
                    : price?.interval === "year"
                      ? t("billing.pricing.perSeatYear")
                      : t("billing.pricing.perSeat")}
                </span>
              </p>
            </CardHeader>
            <CardContent className="flex-1">
              <ul className="space-y-2 text-sm">
                {featureLines(e, t).map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <PricingCta
                plan={plan}
                highlighted={highlighted}
                isCurrent={isCurrent}
                isSignedIn={isSignedIn}
                canCheckout={canCheckout}
              />
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}

function featureLines(
  e: Entitlements,
  t: Awaited<ReturnType<typeof getT>>["t"],
): string[] {
  const lines = [
    t("billing.features.participants", { max: e.maxParticipants }),
  ];
  if (e.maxMeetingMinutes == null) {
    lines.push(t("billing.features.unlimitedDuration"));
  } else if (e.maxMeetingMinutes % 60 === 0) {
    lines.push(t("billing.features.hours", { max: e.maxMeetingMinutes / 60 }));
  } else {
    lines.push(t("billing.features.minutes", { max: e.maxMeetingMinutes }));
  }
  lines.push(
    e.maxUpcomingScheduled == null
      ? t("billing.features.unlimitedUpcoming")
      : t("billing.features.upcoming", { max: e.maxUpcomingScheduled }),
  );
  if (e.breakouts) lines.push(t("billing.features.breakouts"));
  if (e.apiAccess) lines.push(t("billing.features.apiAccess"));
  if (e.seatsBillable) lines.push(t("billing.features.seats"));
  return lines;
}
