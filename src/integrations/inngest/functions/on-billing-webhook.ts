import { eq } from "drizzle-orm";
import { NonRetriableError } from "inngest";

import { db } from "@/drizzle";
import {
  type BillingCheckout,
  type BillingEvent,
  type BillingEventOutcome,
  BillingEventsTable,
  type BillingProviderId,
  OrganizationsTable,
} from "@/drizzle/schema";
import {
  type BillingInterval,
  catalogIdToPlanAndInterval,
  type PaidPlanId,
  planToCatalogId,
} from "@/features/billing/catalog";
import {
  completeCheckout,
  findCheckout,
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
import {
  type PlanChange,
  type SubscriptionFacts,
  subscriptionToPlanChange,
} from "@/features/billing/server/subscription-mapping";
import {
  applyBillingSubscription,
  findOrganizationForBilling,
} from "@/features/billing/server/subscriptions";
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

/** Paymob bills every N days; the periods we grant match its `frequency`. */
const INTERVAL_DAYS: Record<BillingInterval, number> = { month: 30, year: 365 };

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
      const { billingEventId } = event.data.event.data;
      await markProcessed(billingEventId, "error", error.message);
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
  const checkout = await findCheckout(db, provider.id, {
    providerOrderId: parsed.providerOrderId,
    reference: parsed.reference,
  });
  if (checkout) return applyInitialPayment(provider, row, parsed, checkout);
  return applyRecurringPayment(provider, row, parsed);
}

async function applyInitialPayment(
  provider: BillingProvider,
  row: BillingEvent,
  parsed: Extract<ParsedBillingEvent, { kind: "transaction" }>,
  checkout: BillingCheckout,
): Promise<BillingEventOutcome> {
  await setEventOrganization(row.id, checkout.organizationId);
  if (parsed.pending) return "skipped_unhandled";

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
  if (!subscriptionId) return "skipped_no_org";
  const organizationId = await findOrganizationForBilling(db, provider.id, {
    organizationId: row.organizationId,
    subscriptionId,
  });
  if (!organizationId) return "skipped_no_org";
  await setEventOrganization(row.id, organizationId);

  const catalog = getPlanCatalog();
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
