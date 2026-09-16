"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import type { BillingInterval, PaidPlanId } from "../tiers";
import {
  type BillingContact,
  BillingContactDialog,
} from "./billing-contact-dialog";

type CheckoutButtonProps = {
  plan: PaidPlanId;
  interval: BillingInterval;
  seats: number;
  /** Prefills the dialog for an org that has paid before. */
  contact?: BillingContact | null;
  variant?: "default" | "outline";
  className?: string;
  children: React.ReactNode;
};

/**
 * Collects the buyer's contact, asks the server for a checkout bound to
 * the active org, and sends the browser to the provider's hosted page.
 * Nothing about the price travels from the browser; the amount is
 * computed server-side from the plan, interval and seats.
 */
export function CheckoutButton({
  plan,
  interval,
  seats,
  contact,
  variant = "default",
  className,
  children,
}: CheckoutButtonProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();

  const createCheckout = useMutation(
    trpc.billing.createCheckout.mutationOptions({
      // A top-level navigation: the payment page is never framed.
      onSuccess: ({ url }) => window.location.assign(url),
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <BillingContactDialog
      trigger={<Button variant={variant} className={className} />}
      title={t("billing.checkout.title")}
      lead={t("billing.checkout.lead", {
        plan: t(`billing.plans.${plan}.name`),
        seats,
      })}
      submitLabel={t("billing.checkout.continue")}
      contact={contact}
      isPending={createCheckout.isPending || createCheckout.isSuccess}
      onSubmit={(values) =>
        createCheckout.mutate({ plan, interval, seats, ...values })
      }
    >
      {children}
    </BillingContactDialog>
  );
}
