import { z } from "zod";

import type { BillingSubscriptionStatus } from "@/drizzle/schema";
import type { ParsedBillingEvent } from "@/features/billing/server/provider";
import type { SubscriptionFacts } from "@/features/billing/server/subscription-mapping";
import { BILLING_CURRENCY } from "@/features/billing/tiers";

/**
 * Pure parsing of Paymob payloads — callbacks and API responses — into the
 * app's neutral shapes. No SDK, no network: every function here runs on a
 * stored `billing_events.payload` or a fetched JSON body, so events can be
 * re-processed and unit-tested with fixtures.
 *
 * Paymob's payloads carry far more than we read and vary between the
 * processed callback and the response redirect, so every schema is
 * `passthrough` and only the fields we act on are typed.
 */

/** Event types as stored in `billing_events.event_type`. */
export const PAYMOB_EVENT_TYPES = {
  transaction: "paymob.transaction",
  token: "paymob.token",
  subscription: "paymob.subscription",
} as const;

const idSchema = z.union([z.number(), z.string()]).transform(String);

const transactionObjSchema = z
  .object({
    id: idSchema,
    pending: z.boolean(),
    success: z.boolean(),
    amount_cents: z.number(),
    currency: z.string().default(BILLING_CURRENCY),
    created_at: z.string(),
    is_refunded: z.boolean().optional(),
    is_voided: z.boolean().optional(),
    // Set on the transaction Paymob creates *for* a refund or void; the
    // original payment is named by `parent_transaction`.
    is_refund: z.boolean().optional(),
    is_void: z.boolean().optional(),
    parent_transaction: idSchema.nullish(),
    source_data: z
      .object({
        // Masked by Paymob (last four digits); never a full card number.
        pan: z.string().nullish(),
        sub_type: z.string().nullish(),
        type: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
    order: z
      .object({
        id: idSchema,
        merchant_order_id: z.string().nullish(),
        // Paymob may attach the subscription here for recurring charges.
        subscription_id: idSchema.nullish(),
        subscription: z.object({ id: idSchema }).passthrough().nullish(),
      })
      .passthrough(),
    subscription_id: idSchema.nullish(),
    subscription: z.object({ id: idSchema }).passthrough().nullish(),
    data: z
      .object({ subscription_id: idSchema.nullish() })
      .passthrough()
      .nullish(),
    payment_key_claims: z
      .object({
        billing_data: z
          .object({ email: z.string().nullish() })
          .passthrough()
          .nullish(),
        extra: z.record(z.string(), z.unknown()).nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export const transactionCallbackSchema = z
  .object({ type: z.literal("TRANSACTION"), obj: transactionObjSchema })
  .passthrough();

const tokenObjSchema = z
  .object({
    id: idSchema,
    token: z.string(),
    masked_pan: z.string(),
    card_subtype: z.string().nullish(),
    email: z.string().default(""),
    order_id: idSchema.nullish(),
    created_at: z.string(),
  })
  .passthrough();

export const tokenCallbackSchema = z
  .object({ type: z.literal("TOKEN"), obj: tokenObjSchema })
  .passthrough();

/**
 * The subscription webhook registered on a plan. Its body is not
 * documented and carries no signature, so only an id is read from it —
 * the subscription is then re-fetched from the API before anything is
 * applied. Every plausible place Paymob might put the id is tried.
 */
const subscriptionWebhookSchema = z
  .object({
    id: idSchema.nullish(),
    subscription_id: idSchema.nullish(),
    subscription: z.object({ id: idSchema }).passthrough().nullish(),
    obj: z
      .object({
        id: idSchema.nullish(),
        subscription_id: idSchema.nullish(),
        subscription: z.object({ id: idSchema }).passthrough().nullish(),
      })
      .passthrough()
      .nullish(),
    data: z
      .object({
        id: idSchema.nullish(),
        subscription_id: idSchema.nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export function subscriptionIdFromWebhook(
  payload: Record<string, unknown>,
): string | null {
  const parsed = subscriptionWebhookSchema.safeParse(payload);
  if (!parsed.success) return null;
  const p = parsed.data;
  return (
    p.subscription_id ??
    p.subscription?.id ??
    p.obj?.subscription_id ??
    p.obj?.subscription?.id ??
    p.data?.subscription_id ??
    p.obj?.id ??
    p.data?.id ??
    p.id ??
    null
  );
}

/** The subscription object as `/api/acceptance/subscriptions/:id` returns it. */
export const subscriptionResponseSchema = z
  .object({
    id: idSchema,
    state: z.string().nullish(),
    plan_id: idSchema.nullish(),
    plan: z.object({ id: idSchema }).passthrough().nullish(),
    amount_cents: z.number().nullish(),
    starts_at: z.string().nullish(),
    next_billing: z.string().nullish(),
    ends_at: z.string().nullish(),
    resumed_at: z.string().nullish(),
    suspended_at: z.string().nullish(),
    created_at: z.string().nullish(),
    updated_at: z.string().nullish(),
    initial_transaction: idSchema.nullish(),
    frequency: z.number().nullish(),
  })
  .passthrough();

export type PaymobSubscription = z.infer<typeof subscriptionResponseSchema>;

const CANCELED_STATES = new Set(["canceled", "cancelled", "ended", "expired"]);
const PAUSED_STATES = new Set(["suspended", "paused"]);
const ACTIVE_STATES = new Set(["active", "running"]);

/**
 * Paymob's `state` → the app's five statuses. Unknown states fall back to
 * what the timestamps say, and `rawStatus` keeps the original for the
 * admin page so a new state Paymob introduces is visible, not hidden.
 */
export function normalizeSubscriptionStatus(
  sub: Pick<PaymobSubscription, "state" | "suspended_at" | "ends_at">,
  now: Date,
): BillingSubscriptionStatus {
  const state = sub.state?.trim().toLowerCase() ?? "";
  if (CANCELED_STATES.has(state)) return "canceled";
  if (PAUSED_STATES.has(state)) return "paused";
  if (ACTIVE_STATES.has(state)) return "active";
  if (sub.suspended_at) return "paused";
  const endsAt = sub.ends_at ? new Date(sub.ends_at) : null;
  if (endsAt && !Number.isNaN(endsAt.getTime()) && endsAt <= now) {
    return "canceled";
  }
  return "active";
}

/**
 * Normalises a fetched subscription. Paymob bills a flat `amount_cents`
 * per cycle, so seats are derived from it by the mapping, and the next
 * deduction date is the period end.
 */
export function subscriptionToFacts(
  sub: PaymobSubscription,
  now: Date = new Date(),
): SubscriptionFacts {
  const status = normalizeSubscriptionStatus(sub, now);
  const endsAt = sub.ends_at ?? null;
  const endsInFuture = endsAt != null && new Date(endsAt) > now;
  const periodEnd = sub.next_billing ?? endsAt ?? null;
  return {
    id: sub.id,
    customerId: null,
    status,
    rawStatus: sub.state ?? null,
    planId: sub.plan_id ?? sub.plan?.id ?? null,
    quantity: null,
    amountCents: sub.amount_cents ?? null,
    currency: BILLING_CURRENCY,
    currentBillingPeriod: periodEnd
      ? { startsAt: sub.starts_at ?? null, endsAt: periodEnd }
      : null,
    // A cancel already requested but not yet effective keeps access until
    // `ends_at`, exactly like a provider that reports it as scheduled.
    scheduledChange:
      status === "active" && endsInFuture && endsAt
        ? { action: "cancel", effectiveAt: endsAt }
        : status === "canceled" && endsAt
          ? { action: "cancel", effectiveAt: endsAt }
          : null,
    canceledAt: status === "canceled" ? (sub.updated_at ?? endsAt) : null,
    pausedAt: sub.suspended_at ?? null,
  };
}

/**
 * Paymob reports a transaction once per state; the state is part of the
 * id so a pending → final pair is two events, and so is a later "this
 * payment was refunded / voided" update about the same transaction —
 * otherwise that update would be dropped as a replay of the payment.
 */
export function transactionEventId(txn: {
  id: string;
  pending: boolean;
  success: boolean;
  is_refunded?: boolean;
  is_voided?: boolean;
}): string {
  const state = txn.pending ? "pending" : txn.success ? "ok" : "failed";
  const reversal = txn.is_voided
    ? ":voided"
    : txn.is_refunded
      ? ":refunded"
      : "";
  return `txn:${txn.id}:${state}${reversal}`;
}

/** The last four digits of Paymob's masked PAN, or null when it has none. */
export function lastFour(pan: string | null | undefined): string | null {
  const digits = pan?.replace(/\D/g, "") ?? "";
  return digits.length >= 4 ? digits.slice(-4) : null;
}

/** A parsed callback; `other` for anything the app does not act on. */
export function parsePaymobEvent(
  eventType: string,
  payload: Record<string, unknown>,
): ParsedBillingEvent {
  if (eventType === PAYMOB_EVENT_TYPES.transaction) {
    const { obj } = transactionCallbackSchema.parse(payload);
    const subscriptionId =
      obj.subscription_id ??
      obj.subscription?.id ??
      obj.order.subscription_id ??
      obj.order.subscription?.id ??
      obj.data?.subscription_id ??
      null;
    const transactionKind = obj.is_void
      ? "void"
      : obj.is_refund
        ? "refund"
        : "payment";
    return {
      kind: "transaction",
      transactionKind,
      parentTransactionId: obj.parent_transaction ?? null,
      // A payment Paymob reports as already refunded or voided is a status
      // update about money that went back — never something to grant on.
      reversed:
        transactionKind === "payment" &&
        Boolean(obj.is_refunded || obj.is_voided),
      card: {
        brand: obj.source_data?.sub_type ?? null,
        last4: lastFour(obj.source_data?.pan),
        type: obj.source_data?.type ?? null,
      },
      transactionId: obj.id,
      providerOrderId: obj.order.id,
      reference: obj.order.merchant_order_id ?? null,
      success: obj.success && !obj.pending,
      pending: obj.pending,
      amountCents: obj.amount_cents,
      currency: obj.currency,
      subscriptionId,
      email: obj.payment_key_claims?.billing_data?.email ?? null,
    };
  }
  if (eventType === PAYMOB_EVENT_TYPES.token) {
    const { obj } = tokenCallbackSchema.parse(payload);
    return {
      kind: "customer",
      facts: {
        id: obj.id,
        email: obj.email,
        name: null,
        status: "active",
        card: {
          token: obj.token,
          maskedPan: obj.masked_pan,
          brand: obj.card_subtype ?? null,
        },
      },
      providerOrderId: obj.order_id ?? null,
    };
  }
  if (eventType === PAYMOB_EVENT_TYPES.subscription) {
    const subscriptionId = subscriptionIdFromWebhook(payload);
    return subscriptionId
      ? { kind: "subscription_ref", subscriptionId }
      : { kind: "other" };
  }
  return { kind: "other" };
}
