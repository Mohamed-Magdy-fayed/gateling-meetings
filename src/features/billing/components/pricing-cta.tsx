"use client";

import { LinkButton } from "@/components/general/link-button";
import { useTranslation } from "@/features/core/i18n/client";
import type { BillingInterval, PaidPlanId } from "../tiers";
import { CheckoutButton } from "./checkout-button";

type PricingCtaProps = {
  plan: PaidPlanId;
  interval: BillingInterval;
  highlighted: boolean;
  isCurrent: boolean;
  isSignedIn: boolean;
  /** Owner/admin of a billable org with billing configured. */
  canCheckout: boolean;
};

const SIGN_UP_HREF = `/auth/sign-up?returnTo=${encodeURIComponent("/pricing")}`;

/**
 * "Subscribe" opens the checkout for people who can buy; everyone else is
 * routed to the step that unblocks them — an account, or the billing page
 * where a member sees who can change the plan. A subscription belongs to
 * an organization, so an anonymous checkout would take money nobody could
 * be provisioned for; sign-up comes back here afterwards.
 */
export function PricingCta({
  plan,
  interval,
  highlighted,
  isCurrent,
  isSignedIn,
  canCheckout,
}: PricingCtaProps) {
  const { t } = useTranslation();
  const variant = highlighted ? "default" : "outline";

  if (!isSignedIn) {
    return (
      <LinkButton href={SIGN_UP_HREF} className="w-full" variant={variant}>
        {t("billing.pricing.subscribe")}
      </LinkButton>
    );
  }
  if (isCurrent) {
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
        interval={interval}
        seats={1}
        className="w-full"
        variant={variant}
      >
        {t("billing.pricing.subscribe")}
      </CheckoutButton>
    );
  }
  return (
    <LinkButton href="/settings/billing" className="w-full" variant={variant}>
      {t("billing.pricing.subscribe")}
    </LinkButton>
  );
}
