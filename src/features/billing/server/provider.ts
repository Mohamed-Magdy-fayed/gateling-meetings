import "server-only";

import { env } from "@/data/env/server";
import type { BillingProviderId, PlanId } from "@/drizzle/schema";
import type { BillingInterval, PaidPlanId, PlanCatalog } from "../catalog";
import type { CustomerFacts, SubscriptionFacts } from "./subscription-mapping";

/** Who is buying: the signed-in user, as the provider's payment page needs them. */
export type Buyer = {
  id: string;
  email: string;
  name: string;
  phone: string;
};

export type CreateCheckoutInput = {
  /** Our `billing_checkouts.id`, already inserted; the provider echoes it back. */
  checkoutId: string;
  /** Our `billing_checkouts.reference`; the provider must return it verbatim. */
  reference: string;
  organizationId: string;
  plan: PaidPlanId;
  interval: BillingInterval;
  seats: number;
  amountCents: number;
  currency: string;
  buyer: Buyer;
  locale: string;
  /** Where the provider sends the browser afterwards, success or not. */
  returnUrl: string;
};

export type CreateCardUpdateInput = {
  checkoutId: string;
  reference: string;
  organizationId: string;
  subscriptionId: string;
  buyer: Buyer;
  locale: string;
  returnUrl: string;
};

export type CheckoutSession = {
  /** Hosted page to send the browser to (a top-level navigation). */
  url: string;
  providerIntentionId: string;
  providerOrderId: string | null;
};

/** One accepted webhook, verified and ready to be stored. */
export type VerifiedWebhook = {
  /** Stable per delivery: a replay yields the same id. */
  providerEventId: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
};

/** Thrown by `verifyWebhook`; the route answers 401 and stores nothing. */
export class WebhookVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebhookVerificationError";
  }
}

/**
 * What a stored event means, in the app's terms. Parsed from the stored
 * JSON — never from SDK objects — so a row can be re-processed later.
 */
export type ParsedBillingEvent =
  | {
      /** A full subscription snapshot the provider pushed. */
      kind: "subscription";
      facts: SubscriptionFacts;
      providerOrderId: string | null;
    }
  | {
      /**
       * The provider says "subscription X changed" without a trustworthy
       * body; the function re-reads it through `fetchSubscription`.
       */
      kind: "subscription_ref";
      subscriptionId: string;
    }
  | {
      /** A payment attempt: the initial checkout or a recurring deduction. */
      kind: "transaction";
      transactionId: string;
      providerOrderId: string | null;
      /** Our checkout reference, when the provider echoes it. */
      reference: string | null;
      success: boolean;
      pending: boolean;
      amountCents: number;
      currency: string;
      /** Set when the provider ties the payment to a subscription. */
      subscriptionId: string | null;
      email: string | null;
    }
  | {
      /** A card was tokenised for recurring charges. */
      kind: "customer";
      facts: CustomerFacts;
      providerOrderId: string | null;
    }
  | { kind: "other" };

export type WebhookKind = "transaction" | "subscription";

/**
 * Everything the app asks of a payment provider. One implementation per
 * provider under `src/integrations/<provider>/`; the router, the webhook
 * route and the Inngest function only ever talk to this interface.
 *
 * Money never binds to an org through the browser: `createCheckout` gets
 * the org from the caller (server-side), the checkout row is the binding,
 * and every callback resolves the org from that row.
 */
export interface BillingProvider {
  readonly id: BillingProviderId;
  /** `null` until every catalog id is configured; then checkout is offered. */
  readonly catalog: PlanCatalog | null;

  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  /** A payment page whose only purpose is to tokenise a replacement card. */
  createCardUpdate(input: CreateCardUpdateInput): Promise<CheckoutSession>;
  /** New per-cycle charge after a seat change; effective from the next cycle. */
  updateAmount(subscriptionId: string, amountCents: number): Promise<void>;
  /** Stop future charges. Whether access ends now or at the period end is the app's call. */
  cancel(subscriptionId: string): Promise<void>;
  /** The provider's current view of a subscription, normalised. */
  fetchSubscription(subscriptionId: string): Promise<SubscriptionFacts | null>;
  /**
   * Best effort: the subscription a checkout produced, when the provider
   * does not say so in its callbacks. `null` when unknown (yet).
   */
  findSubscriptionForCheckout(hints: {
    providerOrderId: string | null;
    providerTransactionId: string | null;
  }): Promise<SubscriptionFacts | null>;
  /** Paid charges on a subscription, newest first — the app's invoice list. */
  listCharges(subscriptionId: string): Promise<Charge[]>;
  /** Replace the card recurring deductions run on, once a new one is tokenised. */
  setPrimaryCard(subscriptionId: string, cardId: string): Promise<void>;

  /**
   * Authenticates a delivery and turns it into a storable event, or throws
   * `WebhookVerificationError`. `url` carries the query string some
   * providers sign in (Paymob's `hmac`); `pathToken` is the secret path
   * segment for routes the provider cannot sign.
   */
  verifyWebhook(input: {
    kind: WebhookKind;
    rawBody: string;
    url: URL;
    headers: Headers;
    pathToken: string | null;
  }): Promise<VerifiedWebhook>;
  /** Pure: what a stored event means. */
  parseEvent(
    eventType: string,
    payload: Record<string, unknown>,
  ): ParsedBillingEvent;
}

export type Charge = {
  id: string;
  paidAt: Date | null;
  amountCents: number;
  currency: string;
  success: boolean;
  refunded: boolean;
};

/** What a plan × interval × seats is worth, for the checkout row. */
export type CheckoutQuote = {
  plan: PlanId;
  interval: BillingInterval;
  seats: number;
  amountCents: number;
  currency: string;
};

let cached: BillingProvider | null | undefined;

/**
 * The configured provider, or `null` when `BILLING_PROVIDER` is unset.
 * Loaded lazily so a deploy without billing never touches provider code.
 */
export async function getBillingProvider(): Promise<BillingProvider | null> {
  if (cached !== undefined) return cached;
  cached = env.BILLING_PROVIDER
    ? await billingProviderFor(env.BILLING_PROVIDER)
    : null;
  return cached;
}

/** The adapter for a stored row's `provider`, whether or not it is the live one. */
export async function billingProviderFor(
  id: BillingProviderId,
): Promise<BillingProvider> {
  switch (id) {
    case "paymob": {
      const { paymobProvider } = await import("@/integrations/paymob/provider");
      return paymobProvider;
    }
  }
}
