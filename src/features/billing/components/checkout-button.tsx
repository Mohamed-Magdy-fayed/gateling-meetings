"use client";

import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { usePaddle } from "./paddle-provider";

type CheckoutButtonProps = {
  plan: "pro" | "business";
  seats: number;
  variant?: "default" | "outline";
  className?: string;
  children: React.ReactNode;
};

/**
 * Asks the server for a transaction bound to the active org, then hands
 * it to Paddle's overlay. Disabled until Paddle.js is up.
 */
export function CheckoutButton({
  plan,
  seats,
  variant = "default",
  className,
  children,
}: CheckoutButtonProps) {
  const { t, locale } = useTranslation();
  const trpc = useTRPC();
  const paddle = usePaddle();

  const createCheckout = useMutation(
    trpc.billing.createCheckout.mutationOptions({
      onSuccess: ({ transactionId }) => {
        if (!paddle) {
          toast.error(t("billing.errors.checkoutUnavailable"));
          return;
        }
        paddle.Checkout.open({
          transactionId,
          settings: {
            displayMode: "overlay",
            locale,
            successUrl: `${window.location.origin}/settings/billing?checkout=success`,
          },
        });
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <Button
      variant={variant}
      className={className}
      disabled={!paddle || createCheckout.isPending}
      onClick={() => createCheckout.mutate({ plan, seats })}
    >
      {children}
    </Button>
  );
}
