import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { baseUrl, env } from "@/data/env/server";
import { planToCatalogId } from "@/features/billing/catalog";
import { CHECKOUT_TTL_MS } from "@/features/billing/server/checkouts";
import { getPlanCatalog } from "@/features/billing/server/plan-catalog";
import {
  type BillingProvider,
  type Buyer,
  type Charge,
  type CreateCardUpdateInput,
  type CreateCheckoutInput,
  type VerifiedWebhook,
  WebhookVerificationError,
} from "@/features/billing/server/provider";
import type { SubscriptionFacts } from "@/features/billing/server/subscription-mapping";
import { acceptance, createIntention, unifiedCheckoutUrl } from "./client";
import {
  PAYMOB_EVENT_TYPES,
  parsePaymobEvent,
  subscriptionResponseSchema,
  subscriptionToFacts,
  tokenCallbackSchema,
  transactionCallbackSchema,
} from "./events";
import { verifyTokenHmac, verifyTransactionHmac } from "./hmac";

/**
 * Paymob's `billing_data` wants a postal address on every intention. We
 * sell software, so everything but name, email and phone is Paymob's own
 * documented placeholder for "not applicable".
 */
const NOT_APPLICABLE = "NA";

/**
 * Charged when a replacement card is tokenised through an "add secondary
 * card" intention — Paymob tokenises by taking a payment. EGP 1.00, so the
 * customer sees a nominal line, not a second subscription charge.
 */
const CARD_UPDATE_AMOUNT_CENTS = 100;

/** Pages of the subscription list scanned when a checkout's subscription is not yet known. */
const SUBSCRIPTION_LOOKUP_PAGES = 3;

function splitName(name: string): { first: string; last: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.shift() ?? NOT_APPLICABLE;
  const last = parts.join(" ") || first;
  return { first, last };
}

function billingData(buyer: Buyer) {
  const { first, last } = splitName(buyer.name);
  return {
    first_name: first,
    last_name: last,
    email: buyer.email,
    phone_number: buyer.phone,
    country: "EGY",
    apartment: NOT_APPLICABLE,
    floor: NOT_APPLICABLE,
    street: NOT_APPLICABLE,
    building: NOT_APPLICABLE,
    city: NOT_APPLICABLE,
    state: NOT_APPLICABLE,
    postal_code: NOT_APPLICABLE,
    shipping_method: NOT_APPLICABLE,
  };
}

/**
 * Where Paymob posts the processed callback. On a protected Vercel preview
 * the bypass secret rides along so the deployment's auth wall lets the
 * callback through; production has no wall and no secret.
 */
export function transactionCallbackUrl(): string {
  const url = new URL("/api/billing/webhook/paymob/transaction", baseUrl);
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    url.searchParams.set(
      "x-vercel-protection-bypass",
      env.VERCEL_AUTOMATION_BYPASS_SECRET,
    );
  }
  return url.toString();
}

/** The plan-level webhook, reachable only with the secret path token. */
export function subscriptionWebhookUrl(): string {
  const token = env.PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN;
  if (!token) throw new Error("PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN is not set");
  const url = new URL(
    `/api/billing/webhook/paymob/subscription/${token}`,
    baseUrl,
  );
  if (env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    url.searchParams.set(
      "x-vercel-protection-bypass",
      env.VERCEL_AUTOMATION_BYPASS_SECRET,
    );
  }
  return url.toString();
}

function integrationId(): number {
  const id = env.PAYMOB_CARD_INTEGRATION_ID;
  if (!id) throw new Error("PAYMOB_CARD_INTEGRATION_ID is not set");
  return id;
}

function orderIdOf(response: { intention_order_id?: number | string | null }) {
  return response.intention_order_id == null
    ? null
    : String(response.intention_order_id);
}

const listSchema = <T extends z.ZodTypeAny>(item: T) =>
  z.union([
    z.array(item),
    z
      .object({
        results: z.array(item),
        next: z.union([z.string(), z.number()]).nullish(),
      })
      .passthrough(),
  ]);

const chargeSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    pending: z.boolean().optional(),
    success: z.boolean(),
    amount_cents: z.number(),
    currency: z.string().nullish(),
    is_refunded: z.boolean().optional(),
    created_at: z.string().nullish(),
    paid_at: z.string().nullish(),
  })
  .passthrough();

function items<T>(parsed: T[] | { results: T[] }): T[] {
  return Array.isArray(parsed) ? parsed : parsed.results;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw);
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  } catch {
    // fall through
  }
  throw new WebhookVerificationError("body is not a JSON object");
}

/**
 * Egypt's Paymob behind the app's `BillingProvider` interface.
 *
 * - Checkout is an *intention* bound to a subscription plan; the buyer
 *   pays the first cycle on Paymob's hosted page and the card is
 *   tokenised for the recurring deductions Paymob runs itself.
 * - One Paymob plan per tier × interval, created with
 *   `use_transaction_amount`, so the amount we put on the intention
 *   (seats × unit price) is what every later cycle charges.
 * - The processed callback is HMAC-signed and is the trusted signal that
 *   money moved; the plan-level subscription webhook is unsigned and only
 *   ever treated as "go and re-read subscription X".
 */
export const paymobProvider: BillingProvider = {
  id: "paymob",

  get catalog() {
    return getPlanCatalog();
  },

  async createCheckout(input: CreateCheckoutInput) {
    const catalog = getPlanCatalog();
    if (!catalog) throw new Error("Paymob plan ids are not configured");
    const planId = planToCatalogId(catalog, input.plan, input.interval);
    const response = await createIntention({
      amount: input.amountCents,
      currency: input.currency,
      payment_methods: [integrationId()],
      subscription_plan_id: Number(planId),
      items: [
        {
          name: `${input.plan} (${input.interval}) × ${input.seats}`,
          amount: input.amountCents,
          description: `Gateling Meetings ${input.plan} plan, ${input.seats} seat(s), billed per ${input.interval}`,
          quantity: 1,
        },
      ],
      billing_data: billingData(input.buyer),
      special_reference: input.reference,
      extras: {
        organizationId: input.organizationId,
        checkoutId: input.checkoutId,
      },
      expiration: Math.floor(CHECKOUT_TTL_MS / 1000),
      notification_url: transactionCallbackUrl(),
      redirection_url: input.returnUrl,
    });
    return {
      url: unifiedCheckoutUrl(response.client_secret),
      providerIntentionId: response.id,
      providerOrderId: orderIdOf(response),
    };
  },

  async createCardUpdate(input: CreateCardUpdateInput) {
    const response = await createIntention({
      amount: CARD_UPDATE_AMOUNT_CENTS,
      currency: "EGP",
      payment_methods: [integrationId()],
      subscriptionv2_id: Number(input.subscriptionId),
      items: [
        {
          name: "Card update",
          amount: CARD_UPDATE_AMOUNT_CENTS,
          description: "Adds a new card to your Gateling Meetings subscription",
          quantity: 1,
        },
      ],
      billing_data: billingData(input.buyer),
      special_reference: input.reference,
      extras: {
        organizationId: input.organizationId,
        checkoutId: input.checkoutId,
      },
      expiration: Math.floor(CHECKOUT_TTL_MS / 1000),
      notification_url: transactionCallbackUrl(),
      redirection_url: input.returnUrl,
    });
    return {
      url: unifiedCheckoutUrl(response.client_secret),
      providerIntentionId: response.id,
      providerOrderId: orderIdOf(response),
    };
  },

  async updateAmount(subscriptionId, amountCents) {
    await acceptance(
      `/api/acceptance/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "PUT", body: { amount_cents: amountCents } },
      z.unknown(),
    );
  },

  async cancel(subscriptionId) {
    await acceptance(
      `/api/acceptance/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      { method: "POST" },
      z.unknown(),
    );
  },

  async fetchSubscription(subscriptionId) {
    const raw = await acceptance(
      `/api/acceptance/subscriptions/${encodeURIComponent(subscriptionId)}`,
      { method: "GET" },
      z.unknown(),
    );
    const parsed = subscriptionResponseSchema.safeParse(raw);
    return parsed.success ? subscriptionToFacts(parsed.data) : null;
  },

  async findSubscriptionForCheckout({ providerTransactionId }) {
    if (!providerTransactionId) return null;
    let page = 1;
    while (page <= SUBSCRIPTION_LOOKUP_PAGES) {
      const raw = await acceptance(
        `/api/acceptance/subscriptions?page=${page}`,
        { method: "GET" },
        listSchema(subscriptionResponseSchema),
      );
      const list = items(raw);
      const match = list.find(
        (sub) =>
          sub.initial_transaction != null &&
          String(sub.initial_transaction) === providerTransactionId,
      );
      if (match) return subscriptionToFacts(match);
      const hasNext = !Array.isArray(raw) && raw.next != null;
      if (!hasNext || list.length === 0) return null;
      page += 1;
    }
    return null;
  },

  async listCharges(subscriptionId): Promise<Charge[]> {
    const raw = await acceptance(
      `/api/acceptance/subscriptions/${encodeURIComponent(subscriptionId)}/transactions`,
      { method: "GET" },
      listSchema(chargeSchema),
    );
    return items(raw)
      .filter((row) => !row.pending)
      .map((row) => ({
        id: row.id,
        paidAt: row.paid_at
          ? new Date(row.paid_at)
          : row.created_at
            ? new Date(row.created_at)
            : null,
        amountCents: row.amount_cents,
        currency: row.currency ?? "EGP",
        success: row.success,
        refunded: row.is_refunded ?? false,
      }))
      .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0));
  },

  async setPrimaryCard(subscriptionId, cardId) {
    await acceptance(
      `/api/acceptance/subscriptions/${encodeURIComponent(subscriptionId)}/change-primary-card`,
      { method: "POST", body: { card: Number(cardId) } },
      z.unknown(),
    );
  },

  async verifyWebhook({
    kind,
    rawBody,
    url,
    pathToken,
  }): Promise<VerifiedWebhook> {
    if (kind === "subscription") {
      const expected = env.PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN;
      if (!expected || !pathToken || !safeEqual(expected, pathToken)) {
        throw new WebhookVerificationError("bad subscription webhook token");
      }
      const payload = parseJson(rawBody);
      // No provider event id: a replay of the same body is the same event.
      const digest = createHash("sha256").update(rawBody).digest("hex");
      return {
        providerEventId: `sub:${digest.slice(0, 32)}`,
        eventType: PAYMOB_EVENT_TYPES.subscription,
        occurredAt: new Date(),
        payload,
      };
    }

    const secret = env.PAYMOB_HMAC_SECRET;
    if (!secret) throw new WebhookVerificationError("HMAC secret not set");
    const payload = parseJson(rawBody);
    // Paymob puts the signature on the query string; the response redirect
    // (which never reaches this route) carries it in the body instead.
    const received =
      url.searchParams.get("hmac") ??
      (typeof payload.hmac === "string" ? payload.hmac : null);
    const obj = payload.obj;
    if (!obj || typeof obj !== "object") {
      throw new WebhookVerificationError("callback has no obj");
    }
    const objRecord = obj as Record<string, unknown>;

    if (payload.type === "TRANSACTION") {
      if (!verifyTransactionHmac(objRecord, received, secret)) {
        throw new WebhookVerificationError("transaction HMAC mismatch");
      }
      const { obj: txn } = transactionCallbackSchema.parse(payload);
      return {
        // Paymob reports a transaction once per final state; the state is
        // part of the id so a pending → final pair is two events.
        providerEventId: `txn:${txn.id}:${txn.pending ? "pending" : txn.success ? "ok" : "failed"}`,
        eventType: PAYMOB_EVENT_TYPES.transaction,
        occurredAt: new Date(txn.created_at),
        payload,
      };
    }
    if (payload.type === "TOKEN") {
      if (!verifyTokenHmac(objRecord, received, secret)) {
        throw new WebhookVerificationError("token HMAC mismatch");
      }
      const { obj: token } = tokenCallbackSchema.parse(payload);
      return {
        providerEventId: `tok:${token.id}`,
        eventType: PAYMOB_EVENT_TYPES.token,
        occurredAt: new Date(token.created_at),
        payload,
      };
    }
    throw new WebhookVerificationError(
      `unknown callback type ${String(payload.type)}`,
    );
  },

  parseEvent: parsePaymobEvent,
};

export type { SubscriptionFacts };
