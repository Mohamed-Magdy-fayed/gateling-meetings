"use client";

import { Separator } from "@/components/ui/separator";
import { useTranslation } from "@/features/core/i18n/client";
import {
  BILLING_CURRENCY,
  type BillingInterval,
  type PaidPlanId,
  subscriptionAmountCents,
  unitAmountCents,
} from "../tiers";
import { formatMoney } from "./format-money";

/**
 * Exactly what the buyer is about to pay, before they leave for Paymob:
 * the total, how often it renews, and how to stop it. Computed from the
 * same `tiers.ts` function the server charges with, so it cannot drift
 * from the amount on the payment page.
 */
export function CheckoutSummary({
  plan,
  interval,
  seats,
}: {
  plan: PaidPlanId;
  interval: BillingInterval;
  seats: number;
}) {
  const { t, locale } = useTranslation();
  const unit = formatMoney(
    unitAmountCents(plan, interval),
    BILLING_CURRENCY,
    locale,
  );
  const total = formatMoney(
    subscriptionAmountCents(plan, interval, seats),
    BILLING_CURRENCY,
    locale,
  );

  return (
    <section
      aria-label={t("billing.checkout.summaryTitle")}
      className="space-y-2 rounded-lg bg-muted px-4 py-3"
    >
      <p className="text-sm text-muted-foreground">
        {t("billing.checkout.summaryLine", {
          plan: t(`billing.plans.${plan}.name`),
          seats,
          unit,
        })}
      </p>
      <Separator />
      <dl className="text-sm">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="font-medium">{t("billing.checkout.total")}</dt>
          <dd
            data-testid="checkout-total"
            className="font-display text-lg tabular-nums"
          >
            {total}
          </dd>
        </div>
      </dl>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li>{t(`billing.checkout.renewal.${interval}`, { amount: total })}</li>
        <li>{t("billing.checkout.noFees")}</li>
      </ul>
    </section>
  );
}
