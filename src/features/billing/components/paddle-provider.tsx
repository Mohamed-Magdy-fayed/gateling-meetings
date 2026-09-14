"use client";

import {
  CheckoutEventNames,
  initializePaddle,
  type Paddle,
} from "@paddle/paddle-js";
import { useRouter } from "next/navigation";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";

import { env } from "@/data/env/client";

const PaddleContext = createContext<Paddle | null>(null);

type PaddleProviderProps = {
  children: ReactNode;
  /**
   * The active organization's Paddle customer id (`ctm_…`), once it has
   * bought something. Paddle Retain keys its dunning and cancellation
   * flows on it — it must be Paddle's id, never ours or an email.
   */
  customerId?: string | null;
};

/**
 * Loads Paddle.js once, on the pages that open a checkout (the CSP only
 * lets those pages frame Paddle). `usePaddle()` is null until the script
 * is up, or forever when billing is not configured — buttons disable
 * themselves on null rather than throwing.
 */
export function PaddleProvider({ children, customerId }: PaddleProviderProps) {
  const router = useRouter();
  const [paddle, setPaddle] = useState<Paddle | null>(null);

  useEffect(() => {
    const token = env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) return;
    let cancelled = false;
    initializePaddle({
      token,
      environment: env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
      ...(customerId ? { pwCustomer: { id: customerId } } : {}),
      eventCallback: (event) => {
        // The webhook lands the plan; the page just needs to re-read it.
        if (event.name === CheckoutEventNames.CHECKOUT_COMPLETED) {
          router.refresh();
        }
      },
    })
      .then((instance) => {
        if (!cancelled && instance) setPaddle(instance);
      })
      .catch((error) => console.error("[paddle] failed to initialise", error));
    return () => {
      cancelled = true;
    };
  }, [router, customerId]);

  return (
    <PaddleContext.Provider value={paddle}>{children}</PaddleContext.Provider>
  );
}

export function usePaddle() {
  return useContext(PaddleContext);
}
