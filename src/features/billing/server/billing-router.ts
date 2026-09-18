import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import {
  baseUrl,
  isBillingConfigured,
  isBillingInTestMode,
} from "@/data/env/server";
import {
  BillingSubscriptionsTable,
  OrganizationMembershipsTable,
  OrganizationsTable,
} from "@/drizzle/schema";
import {
  createTRPCRouter,
  type OrgContext,
  orgAdminProcedure,
  orgProcedure,
} from "@/integrations/trpc/init";
import { catalogIdToPlanAndInterval } from "../catalog";
import {
  BILLING_CURRENCY,
  subscriptionAmountCents,
  TIER_DEFINITIONS,
} from "../tiers";
import { bindCheckout, openCheckout } from "./checkouts";
import { findBillingCard, findMirroredSubscription } from "./mirror";
import {
  type BillingProvider,
  type Buyer,
  getBillingProvider,
} from "./provider";
import {
  canManageSubscription,
  hasLiveSubscription,
} from "./subscription-state";
import { monthlyParticipantMinutes } from "./usage";

const MAX_SEATS = 500;

/** E.164, which is what Paymob's `billing_data.phone_number` expects. */
export const billingPhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, "billing.validation.phone");

export const billingNameSchema = z.string().trim().min(2).max(128);

async function provider(ctx: OrgContext): Promise<BillingProvider> {
  const live = await getBillingProvider();
  if (!live?.catalog || !isBillingConfigured) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ctx.t("billing.errors.checkoutUnavailable"),
    });
  }
  return live;
}

/**
 * Runs a provider call and turns its failure into a message the buyer can
 * act on. The provider's own words (status codes, endpoint paths) are for
 * the server log, never for the toast.
 */
async function withProvider<T>(
  ctx: OrgContext,
  what: string,
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    console.error(`[billing] ${what} failed`, error);
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: ctx.t("billing.errors.providerUnavailable"),
      cause: error,
    });
  }
}

/** A comped or trial org has nothing to buy; the admin owns its plan. */
function requireBillable(ctx: OrgContext) {
  if (
    ctx.organization.planSource === "manual" ||
    ctx.organization.planSource === "trial"
  ) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ctx.t("billing.errors.granted"),
    });
  }
}

function requireSubscription(ctx: OrgContext) {
  const { billingSubscriptionId } = ctx.organization;
  if (!billingSubscriptionId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ctx.t("billing.errors.noSubscription"),
    });
  }
  return billingSubscriptionId;
}

/**
 * The buyer as the provider's payment page needs them. Name and phone come
 * from the checkout dialog and are remembered on the org for later pages
 * (a card update, a second checkout).
 */
async function buyerFor(
  ctx: OrgContext,
  contact: { name: string; phone: string },
): Promise<Buyer> {
  const email = ctx.session.user.email;
  if (!email) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ctx.t("billing.errors.emailRequired"),
    });
  }
  await ctx.db
    .update(OrganizationsTable)
    .set({ billingName: contact.name, billingPhone: contact.phone })
    .where(eq(OrganizationsTable.id, ctx.organization.id));
  return {
    id: ctx.session.user.id,
    email,
    name: contact.name,
    phone: contact.phone,
  };
}

/**
 * A cancel the app recorded for the period end. Paymob has no "cancel at
 * period end" of its own, so the mirror row is where the schedule lives.
 */
async function scheduledChangeFor(ctx: OrgContext, subscriptionId: string) {
  const mirrored = await findMirroredSubscription(ctx.db, subscriptionId);
  if (!mirrored?.scheduledChangeAction || !mirrored.scheduledChangeAt) {
    return null;
  }
  return {
    action: mirrored.scheduledChangeAction,
    effectiveAt: mirrored.scheduledChangeAt,
  };
}

async function seatsUsed(ctx: OrgContext) {
  const [row] = await ctx.db
    .select({ value: count() })
    .from(OrganizationMembershipsTable)
    .where(
      eq(OrganizationMembershipsTable.organizationId, ctx.organization.id),
    );
  return row?.value ?? 0;
}

async function requireSeats(ctx: OrgContext, seats: number) {
  const used = await seatsUsed(ctx);
  if (seats < used) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: ctx.t("billing.errors.tooFewSeats", { used }),
    });
  }
}

/**
 * Any member may read the summary; only owners/admins (and platform admins)
 * may buy, resize or cancel. Every provider call that binds money to an
 * org happens here, server-side: the checkout row is opened with the org
 * from the session, and nothing about *who paid* is ever taken from the
 * browser or from a callback body alone.
 */
export const billingRouter = createTRPCRouter({
  summary: orgProcedure.query(async ({ ctx }) => {
    const org = ctx.organization;
    const canEdit =
      ctx.isAdmin || ["owner", "admin"].includes(ctx.membership.role);
    const card = await findBillingCard(ctx.db, org.id);
    return {
      canEdit,
      organization: {
        id: org.id,
        name: org.name,
        plan: org.plan,
        planSource: org.planSource,
        planExpiresAt: org.planExpiresAt,
        seatLimit: org.seatLimit,
      },
      entitlements: ctx.entitlements,
      seatsUsed: await seatsUsed(ctx),
      /** Only metered when the plan has a monthly allowance to meter against. */
      monthlyUsage:
        ctx.entitlements.maxMonthlyParticipantMinutes == null
          ? null
          : await monthlyParticipantMinutes(ctx.db, org.id),
      subscription: org.billingSubscriptionId
        ? {
            status: org.billingSubscriptionStatus,
            currentPeriodEndsAt: org.currentPeriodEndsAt,
            scheduledChange: await scheduledChangeFor(
              ctx,
              org.billingSubscriptionId,
            ),
          }
        : null,
      card: card?.maskedPan
        ? { brand: card.cardBrand, maskedPan: card.maskedPan }
        : null,
      billingContact: { name: org.billingName, phone: org.billingPhone },
      pricing: {
        currency: BILLING_CURRENCY,
        unitAmountCents: Object.fromEntries(
          TIER_DEFINITIONS.map((tier) => [tier.name, tier.unitAmountCents]),
        ) as Record<"pro" | "business", Record<"month" | "year", number>>,
      },
      billingConfigured: isBillingConfigured,
      /** The provider is in its test environment: checkouts take no real money. */
      billingTestMode: isBillingInTestMode,
      /** Checkout is offered only when there is nothing hand-granted to override. */
      canCheckout:
        canEdit &&
        isBillingConfigured &&
        org.planSource !== "manual" &&
        org.planSource !== "trial" &&
        !hasLiveSubscription(org),
      canManage: canEdit && isBillingConfigured && canManageSubscription(org),
      /** Paid, but the provider has not yet said which subscription it opened. */
      awaitingSubscription:
        hasLiveSubscription(org) && org.billingSubscriptionId == null,
    };
  }),

  /**
   * Opens a checkout: the row is written first (it is the org binding for
   * every callback), then the provider is asked for a hosted payment page
   * the browser is sent to. Nothing is granted here — the payment
   * callback does that.
   */
  createCheckout: orgAdminProcedure
    .input(
      z.object({
        plan: z.enum(["pro", "business"]),
        interval: z.enum(["month", "year"]),
        seats: z.number().int().min(1).max(MAX_SEATS),
        name: billingNameSchema,
        phone: billingPhoneSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireBillable(ctx);
      if (hasLiveSubscription(ctx.organization)) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ctx.t("billing.errors.alreadySubscribed"),
        });
      }
      await requireSeats(ctx, input.seats);
      const live = await provider(ctx);
      const buyer = await buyerFor(ctx, input);
      const amountCents = subscriptionAmountCents(
        input.plan,
        input.interval,
        input.seats,
      );
      const checkout = await openCheckout(ctx.db, {
        provider: live.id,
        organizationId: ctx.organization.id,
        createdByUserId: ctx.session.user.id,
        kind: "subscribe",
        plan: input.plan,
        interval: input.interval,
        seats: input.seats,
        amountCents,
        currency: BILLING_CURRENCY,
      });
      const session = await withProvider(ctx, "createCheckout", () =>
        live.createCheckout({
          checkoutId: checkout.id,
          reference: checkout.reference,
          organizationId: ctx.organization.id,
          plan: input.plan,
          interval: input.interval,
          seats: input.seats,
          amountCents,
          currency: BILLING_CURRENCY,
          buyer,
          locale: ctx.locale,
          returnUrl: new URL(
            `/welcome?checkout=${checkout.id}`,
            baseUrl,
          ).toString(),
        }),
      );
      await bindCheckout(ctx.db, checkout.id, {
        providerIntentionId: session.providerIntentionId,
        providerOrderId: session.providerOrderId,
      });
      return { url: session.url };
    }),

  /**
   * A payment page whose only purpose is to tokenise a replacement card
   * for the live subscription. The TOKEN callback makes it the primary.
   */
  updateCardUrl: orgAdminProcedure
    .input(z.object({ name: billingNameSchema, phone: billingPhoneSchema }))
    .mutation(async ({ ctx, input }) => {
      requireBillable(ctx);
      const subscriptionId = requireSubscription(ctx);
      const live = await provider(ctx);
      const buyer = await buyerFor(ctx, input);
      const checkout = await openCheckout(ctx.db, {
        provider: live.id,
        organizationId: ctx.organization.id,
        createdByUserId: ctx.session.user.id,
        kind: "update_card",
        plan: ctx.organization.plan,
        interval: "month",
        seats: ctx.organization.seatLimit,
        amountCents: 0,
        currency: BILLING_CURRENCY,
        providerSubscriptionId: subscriptionId,
      });
      const session = await withProvider(ctx, "createCardUpdate", () =>
        live.createCardUpdate({
          checkoutId: checkout.id,
          reference: checkout.reference,
          organizationId: ctx.organization.id,
          subscriptionId,
          buyer,
          locale: ctx.locale,
          returnUrl: new URL(
            "/settings/billing?card=updated",
            baseUrl,
          ).toString(),
        }),
      );
      await bindCheckout(ctx.db, checkout.id, {
        providerIntentionId: session.providerIntentionId,
        providerOrderId: session.providerOrderId,
      });
      return { url: session.url };
    }),

  /**
   * Seat count on the live subscription. The provider charges the new
   * amount from the next cycle (no proration); the seat limit itself
   * moves now, so a team can add a member today.
   */
  updateSeats: orgAdminProcedure
    .input(z.object({ seats: z.number().int().min(1).max(MAX_SEATS) }))
    .mutation(async ({ ctx, input }) => {
      requireBillable(ctx);
      const subscriptionId = requireSubscription(ctx);
      await requireSeats(ctx, input.seats);
      const live = await provider(ctx);
      const mirrored = await findMirroredSubscription(ctx.db, subscriptionId);
      const entry = live.catalog
        ? catalogIdToPlanAndInterval(live.catalog, mirrored?.planId)
        : null;
      if (!entry) throw new TRPCError({ code: "PRECONDITION_FAILED" });
      const amountCents = subscriptionAmountCents(
        entry.plan,
        entry.interval,
        input.seats,
      );
      await withProvider(ctx, "updateAmount", () =>
        live.updateAmount(subscriptionId, amountCents),
      );
      await ctx.db.transaction(async (trx) => {
        await trx
          .update(BillingSubscriptionsTable)
          .set({ quantity: input.seats, amountCents })
          .where(eq(BillingSubscriptionsTable.id, subscriptionId));
        await trx
          .update(OrganizationsTable)
          .set({ seatLimit: input.seats, updatedBy: ctx.session.user.id })
          .where(eq(OrganizationsTable.id, ctx.organization.id));
      });
      return { ok: true };
    }),

  /**
   * Stops future charges at the provider now and lets the paid-for period
   * run out: `planExpiresAt` is what `resolveEntitlements` enforces, and
   * the mirror row records the scheduled end for the billing page.
   */
  cancel: orgAdminProcedure.mutation(async ({ ctx }) => {
    requireBillable(ctx);
    const subscriptionId = requireSubscription(ctx);
    const live = await provider(ctx);
    await withProvider(ctx, "cancel", () => live.cancel(subscriptionId));
    const now = new Date();
    const effectiveAt = ctx.organization.currentPeriodEndsAt ?? now;
    await ctx.db.transaction(async (trx) => {
      await trx
        .update(BillingSubscriptionsTable)
        .set({
          status: "canceled",
          scheduledChangeAction: "cancel",
          scheduledChangeAt: effectiveAt,
          canceledAt: now,
          syncedAt: now,
        })
        .where(eq(BillingSubscriptionsTable.id, subscriptionId));
      await trx
        .update(OrganizationsTable)
        .set({
          billingSubscriptionStatus: "canceled",
          planExpiresAt: effectiveAt,
          billingSyncedAt: now,
          updatedBy: ctx.session.user.id,
        })
        .where(eq(OrganizationsTable.id, ctx.organization.id));
    });
    return { ok: true, effectiveAt };
  }),

  /** Paid charges on the subscription, newest first. */
  invoices: orgProcedure.query(async ({ ctx }) => {
    const subscriptionId = ctx.organization.billingSubscriptionId;
    if (!subscriptionId) return [];
    const live = await getBillingProvider();
    if (!live) return [];
    try {
      return await live.listCharges(subscriptionId);
    } catch (error) {
      // The list is decoration on the billing page; a provider hiccup must
      // not take the page down with it.
      console.error("[billing] listCharges failed", error);
      return [];
    }
  }),
});
