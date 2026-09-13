"use client";

import { LinkButton } from "@/components/general/link-button";
import type { PlanId } from "@/drizzle/schema";
import { useTranslation } from "@/features/core/i18n/client";
import { CheckoutButton } from "./checkout-button";

type PricingCtaProps = {
  plan: PlanId;
  highlighted: boolean;
  isCurrent: boolean;
  isSignedIn: boolean;
  /** Owner/admin of a billable org with billing configured. */
  canCheckout: boolean;
};

export function PricingCta({
  plan,
  highlighted,
  isCurrent,
  isSignedIn,
  canCheckout,
}: PricingCtaProps) {
  const { t } = useTranslation();
  const variant = highlighted ? "default" : "outline";

  if (!isSignedIn) {
    return (
      <LinkButton href="/auth/sign-up" className="w-full" variant={variant}>
        {t("billing.pricing.getStarted")}
      </LinkButton>
    );
  }
  if (isCurrent || plan === "free") {
    return (
      <LinkButton href="/settings/billing" className="w-full" variant="outline">
        {t("billing.pricing.manage")}
      </LinkButton>
    );
  }
  if (canCheckout) {
    return (
      <CheckoutButton
        plan={plan}
        seats={1}
        className="w-full"
        variant={variant}
      >
        {t("billing.pricing.upgrade")}
      </CheckoutButton>
    );
  }
  return (
    <LinkButton href="/settings/billing" className="w-full" variant={variant}>
      {t("billing.pricing.upgrade")}
    </LinkButton>
  );
}
