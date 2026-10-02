import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/drizzle";
import {
  type BillingCheckout,
  type BillingEvent,
  type BillingEventOutcome,
  BillingEventsTable,
  type BillingProviderId,
  BillingSubscriptionsTable,
  type BillingTransaction,
  OrganizationsTable,
} from "@/drizzle/schema";
import {
  type BillingInterval,
  catalogIdToPlanAndInterval,
  type PaidPlanId,
  planToCatalogId,
} from "@/features/billing/catalog";
import { chargeMatches, reversalFromReport } from "@/features/billing/ledger";
import { sendBillingAlert } from "@/features/billing/server/alerts";
import {
  completeCheckout,
  findCheckout,
  findCheckoutBySubscription,
  linkCheckoutSubscription,
} from "@/features/billing/server/checkouts";
import {
  factsFromMirror,
  findMirroredSubscription,
  upsertBillingCustomer,
  upsertBillingSubscription,
} from "@/features/billing/server/mirror";
import { getPlanCatalog } from "@/features/billing/server/plan-catalog";
import {
  type BillingProvider,
  billingProviderFor,
  type ParsedBillingEvent,
} from "@/features/billing/server/provider";
import { sendReceiptsForEvent } from "@/features/billing/server/receipts";
import {
  type PlanChange,
  type SubscriptionFacts,
  subscriptionToPlanChange,
} from "@/features/billing/server/subscription-mapping";
import {
  applyBillingSubscription,
  findOrganizationForBilling,
} from "@/features/billing/server/subscriptions";
import {
  applyReversalToPayment,
  findTransaction,
  latestPayment,
  organizationOwnerEmail,
  recordTransaction,
  setPaymentRefundedTotal,
  userEmail,
} from "@/features/billing/server/transactions";
import { PaymobApiError } from "@/integrations/paymob/client";
import { inngest } from "../client";
import { billingWebhookReceivedEvent } from "./billing-events";

const ERROR_TEXT_LIMIT = 500;

/** How long to keep asking the provider which subscription a checkout produced. */
const LINK_RETRY_DELAYS = ["2m", "15m", "2h"] as const;

type PendingLink = {
  provider: BillingProviderId;
  checkoutId: string;
  organizationId: string;
  providerOrderId: string | null;
  providerTransactionId: string | null;
};

/**
 * Paymob bills every N days; the periods we grant match its `frequency`
 * (`scripts/seed-paymob-plans.ts` creates the plans with 30 and 360).
 */
const INTERVAL_DAYS: Record<BillingInterval, number> = { month: 30, year: 360 };

function addInterval(from: Date, interval: BillingInterval): Date {
  return new Date(
    from.getTime() + INTERVAL_DAYS[interval] * 24 * 60 * 60 * 1000,
  );
}

/**
 * Applies one stored billing event. Two things happen, in order:
 *
 * 1. The provider's entity is mirrored into `billing_customers` /
 *    `billing_subscriptions` exactly as sent (or as re-read from its API)
 *    — always, even when no org is known yet, so the mirror is complete
 *    and can be re-linked later.
 * 2. The org's plan is derived and landed on `organizations` (the part
 *    that actually grants access). For the initial payment that is done
 *    straight from the checkout row, so the customer is not waiting on
 *    the provider's slower subscription webhook.
 *
 * Serialised per org (concurrency key) so two events for the same
 * subscription never race; within that, `applyBillingSubscription` and
 * the mirror upserts drop anything older than what is already applied.
 * `onFailure` records the error on the row so the admin page shows it
 * instead of it vanishing into retries.
 */
export const onBillingWebhook = inngest.createFunction(
  {
    id: "on-billing-webhook",
    triggers: [billingWebhookReceivedEvent],
    concurrency: [{ key: "event.data.organizationId", limit: 1 }],
    onFailure: async ({ event, error }) => {
      const { billingEventId, organizationId } = event.data.event.data;
      await markProcessed(billingEventId, "error", error.message);
      await sendBillingAlert({
        kind: "event_failed",
        throttleKey: billingEventId,
        details: {
          "Billing event": billingEventId,
          Organization: organizationId,
          Error: error.message.slice(0, ERROR_TEXT_LIMIT),
        },
      });
    },
  },
  async ({ event, step }) => {
    const { billingEventId } = event.data;

    const outcome = await step.run(
      "apply",
      async (): Promise<BillingEventOutcome> => {
        const row = await db.query.BillingEventsTable.findFirst({
          where: eq(BillingEventsTable.id, billingEventId),
        });
        if (!row) throw new NonRetriableError("billing event row missing");

        const provider = await billingProviderFor(row.provider);
        const parsed = provider.parseEvent(row.eventType, row.payload);
        try {
          return await applyParsed(provider, row, parsed);
        } catch (error) {
          // A 4xx from the provider will not get better on retry.
          if (error instanceof PaymobApiError && error.status < 500) {
            throw new NonRetriableError(error.message, { cause: error });
          }
          throw error;
        }
      },
    );

    await step.run("mark-processed", () =>
      markProcessed(billingEventId, outcome),
    );

    // A receipt for every successful payment, renewal, refund and void the
    // event recorded — whatever the outcome for the plan (an org on a
    // hand-granted plan that still paid gets one too). Its own step so an
    // SMTP hiccup retries the email, not the payment.
    await step.run("send-receipts", () =>
      sendReceiptsForEvent(db, billingEventId),
    );

    // A paid checkout whose subscription the provider has not named yet:
    // keep asking for a while, so seats and cancellation work without
    // waiting on a webhook the provider may never send.
    if (outcome === "applied") {
      const pending = await step.run("pending-link", () =>
        pendingSubscriptionLink(billingEventId),
      );
      if (pending) {
        for (const [attempt, delay] of LINK_RETRY_DELAYS.entries()) {
          await step.sleep(`wait-for-subscription-${attempt}`, delay);
          const linked = await step.run(`link-subscription-${attempt}`, () =>
            linkSubscription(pending),
          );
          if (linked) break;
        }
      }
    }
    return { outcome };
  },
);

async function applyParsed(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: ParsedBillingEvent,
): Promise<BillingEventOutcome> {
  switch (parsed.kind) {
    case "other":
      return "skipped_unhandled";
    case "customer":
      return applyCustomer(provider, row, parsed);
    case "transaction":
      return applyTransaction(provider, row, parsed);
    case "subscription":
      return applySubscription(provider, row, parsed.facts);
    case "subscription_ref": {
      const facts = await provider.fetchSubscription(parsed.subscriptionId);
      if (!facts) return "skipped_unhandled";
      return applySubscription(provider, row, facts);
    }
  }
}

/**
 * A card was tokenised: mirror it, remember it on the org, and — when the
 * checkout that produced it was a card update — make it the card the
 * subscription charges from now on.
 */
async function applyCustomer(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: Extract<ParsedBillingEvent, { kind: "customer" }>,
): Promise<BillingEventOutcome> {
  const checkout = await findCheckout(db, provider.id, {
    providerOrderId: parsed.providerOrderId,
    reference: null,
  });
  const organizationId =
    checkout?.organizationId ??
    (await findOrganizationForBilling(db, provider.id, {
      organizationId: row.organizationId,
      customerId: parsed.facts.id,
    }));
  await upsertBillingCustomer(
    db,
    provider.id,
    parsed.facts,
    organizationId,
    row.occurredAt,
  );
  if (!organizationId) return "skipped_no_org";

  await db
    .update(OrganizationsTable)
    .set({ billingCustomerId: parsed.facts.id, updatedBy: "billing" })
    .where(eq(OrganizationsTable.id, organizationId));
  await setEventOrganization(row.id, organizationId);

  if (checkout?.kind === "update_card" && checkout.providerSubscriptionId) {
    await provider.setPrimaryCard(
      checkout.providerSubscriptionId,
      parsed.facts.id,
    );
  }
  return "applied";
}

/**
 * A payment attempt. Matched to a checkout row it is the initial payment
 * (the plan is applied from what the buyer agreed to); otherwise it is a
 * recurring deduction on a known subscription (the period moves forward,
 * or the org goes past due).
 */
async function applyTransaction(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: Extract<ParsedBillingEvent, { kind: "transaction" }>,
): Promise<BillingEventOutcome> {
  // Refunds and voids arrive on the same callback as payments, often with
  // the same order (and so the same checkout). They must never reach the
  // payment paths below, which would grant or extend a plan.
  if (parsed.transactionKind !== "payment") {
    return applyReversal(provider, row, parsed);
  }
  if (parsed.reversed) return applyReversedPaymentUpdate(provider, row, parsed);

  const checkout = await findCheckout(db, provider.id, {
    providerOrderId: parsed.providerOrderId,
    reference: parsed.reference,
  });
  if (checkout) return applyInitialPayment(provider, row, parsed, checkout);
  return applyRecurringPayment(provider, row, parsed);
}

type TransactionEvent = Extract<ParsedBillingEvent, { kind: "transaction" }>;

/** The ledger columns every recorded transaction shares. */
function ledgerValues(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: TransactionEvent,
) {
  return {
    provider: provider.id,
    providerTransactionId: parsed.transactionId,
    kind: parsed.transactionKind,
    status: parsed.success ? ("succeeded" as const) : ("failed" as const),
    parentTransactionId: parsed.parentTransactionId,
    billingEventId: row.id,
    providerOrderId: parsed.providerOrderId,
    providerSubscriptionId: parsed.subscriptionId,
    amountCents: parsed.amountCents,
    currency: parsed.currency.toUpperCase(),
    cardBrand: parsed.card.brand?.slice(0, 32) ?? null,
    cardLast4: parsed.card.last4,
    occurredAt: row.occurredAt,
  };
}

/**
 * A refund or void of an earlier payment: recorded against the payment
 * it reverses, never granted on. Access is deliberately not cut here — a
 * partial or goodwill refund must not end a subscription; cancelling is
 * the admin's separate, explicit step (see docs/payments.md).
 */
async function applyReversal(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: TransactionEvent,
): Promise<BillingEventOutcome> {
  if (parsed.pending) return "skipped_unhandled";
  const payment = parsed.parentTransactionId
    ? await findTransaction(db, provider.id, parsed.parentTransactionId)
    : null;
  const checkout = payment
    ? null
    : await findCheckout(db, provider.id, {
        providerOrderId: parsed.providerOrderId,
        reference: parsed.reference,
      });
  const organizationId =
    payment?.organizationId ??
    checkout?.organizationId ??
    row.organizationId ??
    null;

  await recordTransaction(db, {
    ...ledgerValues(provider, row, parsed),
    organizationId,
    checkoutId: payment?.checkoutId ?? checkout?.id ?? null,
    providerSubscriptionId:
      parsed.subscriptionId ?? payment?.providerSubscriptionId ?? null,
    plan: payment?.plan ?? null,
    interval: payment?.interval ?? null,
    seats: payment?.seats ?? null,
    cardBrand: parsed.card.brand ?? payment?.cardBrand ?? null,
    cardLast4: parsed.card.last4 ?? payment?.cardLast4 ?? null,
    customerEmail: payment?.customerEmail ?? null,
  });
  if (payment && parsed.success && parsed.transactionKind !== "payment") {
    await applyReversalToPayment(db, payment, {
      kind: parsed.transactionKind,
      amountCents: parsed.amountCents,
      at: row.occurredAt,
    });
  }
  if (organizationId) await setEventOrganization(row.id, organizationId);
  console.warn(
    `[billing] ${parsed.transactionKind} ${parsed.transactionId} of ${parsed.parentTransactionId ?? "unknown payment"} recorded (${parsed.success ? "succeeded" : "failed"})`,
  );
  return "applied";
}

/**
 * Paymob re-reporting a payment as refunded or voided — which is how it
 * reports refunds: the original payment is re-sent with `is_refunded` and a
 * running `refunded_amount_cents`; the refund transaction itself gets no
 * callback. The new part of that total is recorded as a refund row (which
 * the customer gets a confirmation for), never granted on; when the
 * payment paying for the current period comes back in full, the
 * subscription ends.
 */
async function applyReversedPaymentUpdate(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: TransactionEvent,
): Promise<BillingEventOutcome> {
  const payment = await findTransaction(db, provider.id, parsed.transactionId);
  if (!payment) {
    console.warn(
      `[billing:${provider.id}] refund reported for unknown payment ${parsed.transactionId}`,
    );
    return "skipped_unhandled";
  }
  const reversal = reversalFromReport(
    {
      amountCents: payment.amountCents,
      refundedAmountCents: payment.refundedAmountCents,
      voided: payment.voidedAt != null,
    },
    { refundedAmountCents: parsed.refundedAmountCents, voided: parsed.voided },
  );
  if (!reversal) return "skipped_stale";

  await recordTransaction(db, {
    provider: provider.id,
    // Paymob does not send the refund's own id here; this one is stable
    // per refunded total, so a redelivery is the same row.
    providerTransactionId: `${payment.providerTransactionId}:${reversal.kind}:${reversal.refundedTotal}`,
    kind: reversal.kind,
    status: "succeeded",
    parentTransactionId: payment.providerTransactionId,
    organizationId: payment.organizationId,
    checkoutId: payment.checkoutId,
    billingEventId: row.id,
    providerOrderId: payment.providerOrderId,
    providerSubscriptionId: payment.providerSubscriptionId,
    amountCents: reversal.amountCents,
    currency: payment.currency,
    plan: payment.plan,
    interval: payment.interval,
    seats: payment.seats,
    cardBrand: payment.cardBrand,
    cardLast4: payment.cardLast4,
    customerEmail: payment.customerEmail,
    occurredAt: row.receivedAt,
  });
  await setPaymentRefundedTotal(
    db,
    payment.id,
    reversal.refundedTotal,
    reversal.kind === "void" ? row.receivedAt : null,
  );
  if (payment.organizationId) {
    await setEventOrganization(row.id, payment.organizationId);
  }

  const isFull = reversal.refundedTotal >= payment.amountCents;
  if (isFull && payment.organizationId) {
    await endSubscriptionAfterFullRefund(provider, payment);
  }
  return "applied";
}

/**
 * The money for the current period went back in full: stop future charges
 * and end the plan now. Only for the org's most recent payment (refunding
 * an old renewal does not cut a newer paid period) and only for a plan the
 * subscription owns — a hand-granted or trial plan is never touched.
 */
async function endSubscriptionAfterFullRefund(
  provider: BillingProvider,
  payment: BillingTransaction,
): Promise<void> {
  const organizationId = payment.organizationId;
  if (!organizationId) return;
  const latest = await latestPayment(db, organizationId);
  if (latest?.id !== payment.id) return;
  const org = await db.query.OrganizationsTable.findFirst({
    where: eq(OrganizationsTable.id, organizationId),
  });
  if (org?.planSource !== "subscription") return;

  const subscriptionId =
    org.billingSubscriptionId ?? payment.providerSubscriptionId;
  if (subscriptionId) {
    // Best effort: the plan ends either way; a failed cancel is alerted.
    try {
      await provider.cancel(subscriptionId);
    } catch (error) {
      console.error("[billing] cancel after full refund failed", error);
      await sendBillingAlert({
        kind: "event_failed",
        throttleKey: `cancel:${subscriptionId}`,
        details: {
          Problem:
            "Full refund recorded but the subscription could not be cancelled at Paymob — cancel it in the dashboard so the card is not charged again.",
          Subscription: subscriptionId,
          Organization: organizationId,
        },
      });
    }
  }
  const now = new Date();
  await db.transaction(async (trx) => {
    if (subscriptionId) {
      await trx
        .update(BillingSubscriptionsTable)
        .set({ status: "canceled", canceledAt: now, syncedAt: now })
        .where(eq(BillingSubscriptionsTable.id, subscriptionId));
    }
    await trx
      .update(OrganizationsTable)
      .set({
        billingSubscriptionStatus: "canceled",
        planExpiresAt: now,
        billingSyncedAt: now,
        updatedBy: "billing",
      })
      .where(eq(OrganizationsTable.id, organizationId));
  });
  console.warn(
    `[billing] org ${organizationId}: payment ${payment.providerTransactionId} refunded in full; subscription ended`,
  );
}

/** Buyer named on the payment, else whoever opened the checkout, else the org owner. */
async function receiptEmail(
  parsed: TransactionEvent,
  checkout: BillingCheckout | null,
  organizationId: string | null,
): Promise<string | null> {
  return (
    parsed.email ??
    (await userEmail(db, checkout?.createdByUserId ?? null)) ??
    (organizationId ? await organizationOwnerEmail(db, organizationId) : null)
  );
}

async function applyInitialPayment(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: Extract<ParsedBillingEvent, { kind: "transaction" }>,
  checkout: BillingCheckout,
): Promise<BillingEventOutcome> {
  await setEventOrganization(row.id, checkout.organizationId);
  if (parsed.pending) return "skipped_unhandled";

  const isSubscribe = checkout.kind === "subscribe";
  await recordTransaction(db, {
    ...ledgerValues(provider, row, parsed),
    organizationId: checkout.organizationId,
    checkoutId: checkout.id,
    plan: isSubscribe ? checkout.plan : null,
    interval: isSubscribe ? checkout.interval : null,
    seats: isSubscribe ? checkout.seats : null,
    customerEmail: await receiptEmail(
      parsed,
      checkout,
      checkout.organizationId,
    ),
  });

  // The intention was created server-side with the checkout's amount, so a
  // mismatch means something is wrong upstream: record the money, grant
  // nothing, and leave it on the admin page as an error to resolve.
  if (
    isSubscribe &&
    parsed.success &&
    !chargeMatches(parsed, {
      amountCents: checkout.amountCents,
      currency: checkout.currency,
    })
  ) {
    console.error(
      `[billing] checkout ${checkout.id} charged ${parsed.amountCents} ${parsed.currency}, expected ${checkout.amountCents} ${checkout.currency}; plan not granted`,
    );
    throw new NonRetriableError(
      `amount mismatch: charged ${parsed.amountCents} ${parsed.currency}, checkout was ${checkout.amountCents} ${checkout.currency}`,
    );
  }

  await completeCheckout(db, checkout.id, {
    status: parsed.success ? "paid" : "failed",
    providerTransactionId: parsed.transactionId,
    completedAt: row.occurredAt,
  });
  if (!parsed.success) return "applied";
  // A card update pays a nominal amount; the TOKEN callback does the rest.
  if (checkout.kind === "update_card") return "applied";

  const catalog = getPlanCatalog();
  if (!catalog) throw new NonRetriableError("billing catalog not configured");
  if (checkout.plan === "free") {
    throw new NonRetriableError(`checkout ${checkout.id} is for the free plan`);
  }
  const plan = checkout.plan as PaidPlanId;
  const interval = checkout.interval as BillingInterval;

  // The subscription the provider created for this payment, if it says
  // which. Best effort: the customer paid, so the plan is granted whether
  // or not the provider's API answers right now — the subscription id is
  // linked later by its own webhook if it cannot be found here.
  const facts = await bestEffort(
    "subscription lookup",
    async () =>
      (parsed.subscriptionId
        ? await provider.fetchSubscription(parsed.subscriptionId)
        : null) ??
      (await provider.findSubscriptionForCheckout({
        providerOrderId: parsed.providerOrderId,
        providerTransactionId: parsed.transactionId,
      })),
  );
  if (facts) {
    await linkCheckoutSubscription(db, checkout.id, facts.id);
    await upsertBillingSubscription(
      db,
      provider.id,
      facts,
      checkout.organizationId,
      row.occurredAt,
    );
  }

  // What the buyer agreed to, granted now; the provider's own view (when
  // known) only refines the period end and the subscription id.
  const change: PlanChange = {
    plan,
    planSource: "subscription",
    seatLimit: Math.max(1, checkout.seats),
    planExpiresAt: null,
    billingSubscriptionId: facts?.id ?? null,
    billingSubscriptionStatus: facts?.status ?? "active",
    billingPlanId: planToCatalogId(catalog, plan, interval),
    currentPeriodEndsAt:
      (facts?.currentBillingPeriod?.endsAt
        ? new Date(facts.currentBillingPeriod.endsAt)
        : null) ?? addInterval(row.occurredAt, interval),
  };
  const outcome = await applyBillingSubscription(
    db,
    checkout.organizationId,
    change,
    row.occurredAt,
  );
  return outcome;
}

async function applyRecurringPayment(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: Extract<ParsedBillingEvent, { kind: "transaction" }>,
): Promise<BillingEventOutcome> {
  if (parsed.pending) return "skipped_unhandled";
  const subscriptionId = parsed.subscriptionId;
  const organizationId = subscriptionId
    ? await findOrganizationForBilling(db, provider.id, {
        organizationId: row.organizationId,
        subscriptionId,
      })
    : null;

  // Money moved whether or not we can place it: the ledger always gets it.
  const catalog = getPlanCatalog();
  const mirroredForLedger = subscriptionId
    ? await findMirroredSubscription(db, subscriptionId)
    : null;
  const entry = catalog
    ? catalogIdToPlanAndInterval(catalog, mirroredForLedger?.planId)
    : null;
  const originalCheckout = subscriptionId
    ? await findCheckoutBySubscription(db, provider.id, subscriptionId)
    : null;
  await recordTransaction(db, {
    ...ledgerValues(provider, row, parsed),
    organizationId,
    checkoutId: originalCheckout?.id ?? null,
    plan: entry?.plan ?? null,
    interval: entry?.interval ?? null,
    seats: mirroredForLedger?.quantity ?? null,
    customerEmail: await receiptEmail(parsed, originalCheckout, organizationId),
  });

  if (!subscriptionId || !organizationId) return "skipped_no_org";
  await setEventOrganization(row.id, organizationId);

  if (!catalog) throw new NonRetriableError("billing catalog not configured");

  const fetched = await bestEffort("subscription re-read", () =>
    provider.fetchSubscription(subscriptionId),
  );
  const mirrored = await findMirroredSubscription(db, subscriptionId);
  const base = fetched ?? (mirrored ? factsFromMirror(mirrored) : null);
  if (!base) return "skipped_no_org";

  const facts: SubscriptionFacts = parsed.success
    ? { ...base, status: base.status === "past_due" ? "active" : base.status }
    : {
        ...base,
        status: "past_due",
        currentBillingPeriod: base.currentBillingPeriod ?? {
          startsAt: null,
          endsAt: row.occurredAt.toISOString(),
        },
      };
  // A successful deduction with no fresh period from the API: roll the
  // period forward by the plan's interval ourselves.
  if (parsed.success && !fetched?.currentBillingPeriod) {
    const entry = catalogIdToPlanAndInterval(catalog, facts.planId);
    if (entry) {
      facts.currentBillingPeriod = {
        startsAt: row.occurredAt.toISOString(),
        endsAt: addInterval(row.occurredAt, entry.interval).toISOString(),
      };
    }
  }

  await upsertBillingSubscription(
    db,
    provider.id,
    facts,
    organizationId,
    row.occurredAt,
  );
  const change = subscriptionToPlanChange(facts, catalog, row.occurredAt);
  if (!change) return "skipped_unhandled";
  return applyBillingSubscription(db, organizationId, change, row.occurredAt);
}

/** A subscription snapshot (pushed or re-read): mirror it, then derive the org's plan. */
async function applySubscription(
  provider: BillingProvider,
  row: BillingEvent,
  facts: SubscriptionFacts,
): Promise<BillingEventOutcome> {
  const organizationId = await findOrganizationForBilling(db, provider.id, {
    organizationId: row.organizationId,
    subscriptionId: facts.id,
    customerId: facts.customerId,
  });
  await upsertBillingSubscription(
    db,
    provider.id,
    facts,
    organizationId,
    row.occurredAt,
  );
  if (!organizationId) return "skipped_no_org";
  await setEventOrganization(row.id, organizationId);

  const catalog = getPlanCatalog();
  if (!catalog) throw new NonRetriableError("billing catalog not configured");
  const change = subscriptionToPlanChange(facts, catalog, row.occurredAt);
  if (!change) return "skipped_unhandled";
  return applyBillingSubscription(db, organizationId, change, row.occurredAt);
}

/** The paid `subscribe` checkout behind this event that still has no subscription id. */
async function pendingSubscriptionLink(
  billingEventId: string,
): Promise<PendingLink | null> {
  const row = await db.query.BillingEventsTable.findFirst({
    where: eq(BillingEventsTable.id, billingEventId),
  });
  if (!row) return null;
  const provider = await billingProviderFor(row.provider);
  const parsed = provider.parseEvent(row.eventType, row.payload);
  if (parsed.kind !== "transaction" || !parsed.success) return null;
  const checkout = await findCheckout(db, row.provider, {
    providerOrderId: parsed.providerOrderId,
    reference: parsed.reference,
  });
  const isUnlinkedPaidSubscribe =
    checkout?.kind === "subscribe" &&
    checkout.status === "paid" &&
    !checkout.providerSubscriptionId;
  if (!checkout || !isUnlinkedPaidSubscribe) return null;
  return {
    provider: row.provider,
    checkoutId: checkout.id,
    organizationId: checkout.organizationId,
    providerOrderId: parsed.providerOrderId,
    providerTransactionId: parsed.transactionId,
  };
}

/** One attempt to find and record the subscription; `true` once linked. */
async function linkSubscription(pending: PendingLink): Promise<boolean> {
  const provider = await billingProviderFor(pending.provider);
  const facts = await bestEffort("subscription lookup", () =>
    provider.findSubscriptionForCheckout(pending),
  );
  if (!facts) return false;
  const now = new Date();
  await linkCheckoutSubscription(db, pending.checkoutId, facts.id);
  await upsertBillingSubscription(
    db,
    pending.provider,
    facts,
    pending.organizationId,
    now,
  );
  const catalog = getPlanCatalog();
  const change = catalog ? subscriptionToPlanChange(facts, catalog, now) : null;
  if (change) {
    await applyBillingSubscription(db, pending.organizationId, change, now);
  } else {
    await db
      .update(OrganizationsTable)
      .set({ billingSubscriptionId: facts.id, updatedBy: "billing" })
      .where(eq(OrganizationsTable.id, pending.organizationId));
  }
  return true;
}

/** A provider read whose failure must not block acting on a payment. */
async function bestEffort<T>(
  what: string,
  run: () => Promise<T | null>,
): Promise<T | null> {
  try {
    return await run();
  } catch (error) {
    console.warn(`[billing] ${what} failed; continuing without it`, error);
    return null;
  }
}

async function setEventOrganization(id: string, organizationId: string) {
  await db
    .update(BillingEventsTable)
    .set({ organizationId })
    .where(eq(BillingEventsTable.id, id));
}

async function markProcessed(
  id: string,
  outcome: BillingEventOutcome,
  error?: string,
) {
  await db
    .update(BillingEventsTable)
    .set({
      processedAt: new Date(),
      outcome,
      error: error ? error.slice(0, ERROR_TEXT_LIMIT) : null,
    })
    .where(eq(BillingEventsTable.id, id));
}
