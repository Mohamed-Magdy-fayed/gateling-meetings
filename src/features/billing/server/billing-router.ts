import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import { z } from "zod";

import { isBillingConfigured } from "@/data/env/server";
import { OrganizationMembershipsTable } from "@/drizzle/schema";
import { getPaddle } from "@/integrations/paddle/client";
import { planToPriceId } from "@/integrations/paddle/prices";
import {
  createTRPCRouter,
  type OrgContext,
  orgAdminProcedure,
  orgProcedure,
} from "@/integrations/trpc/init";
import { getPriceMap } from "./price-map";

const MAX_SEATS = 500;

function prices() {
  const map = getPriceMap();
  if (!map) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "Billing is not configured.",
    });
  }
  return map;
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
  const { paddleSubscriptionId, paddleCustomerId } = ctx.organization;
  if (!paddleSubscriptionId || !paddleCustomerId) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: ctx.t("billing.errors.noSubscription"),
    });
  }
  return { paddleSubscriptionId, paddleCustomerId };
}

/**
 * The Paddle customer the checkout should open as. Once the org has bought
 * something it has one; before that, the buyer's own email is looked up or
 * registered so the checkout opens with it prefilled. Attached server-side
 * because a checkout opened from a transaction id takes its customer from
 * the transaction, not from Paddle.js.
 */
async function customerIdFor(ctx: OrgContext): Promise<string | undefined> {
  if (ctx.organization.paddleCustomerId) {
    return ctx.organization.paddleCustomerId;
  }
  const email = ctx.session.user.email;
  // A session without an email (mid-OAuth edge case) just gets asked at checkout.
  if (!email) return undefined;
  const paddle = getPaddle();
  const [existing] = await paddle.customers
    .list({ email: [email], perPage: 1 })
    .next();
  if (existing) return existing.id;
  const created = await paddle.customers.create({ email });
  return created.id;
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

/**
 * Any member may read the summary; only owners/admins (and platform admins)
 * may buy, resize or cancel. Every Paddle call that binds money to an org
 * happens here, server-side, so `custom_data.organizationId` can never be
 * forged from the browser.
 */
export const billingRouter = createTRPCRouter({
  summary: orgProcedure.query(async ({ ctx }) => {
    const org = ctx.organization;
    const canEdit =
      ctx.isAdmin || ["owner", "admin"].includes(ctx.membership.role);
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
      subscription: org.paddleSubscriptionId
        ? {
            status: org.paddleSubscriptionStatus,
            currentPeriodEndsAt: org.currentPeriodEndsAt,
          }
        : null,
      billingConfigured: isBillingConfigured,
      /** Checkout is offered only when there is nothing hand-granted to override. */
      canCheckout:
        canEdit &&
        isBillingConfigured &&
        org.planSource !== "manual" &&
        org.planSource !== "trial" &&
        !org.paddleSubscriptionId,
      canManage:
        canEdit && isBillingConfigured && org.paddleSubscriptionId != null,
    };
  }),

  /**
   * A Paddle transaction for the overlay checkout to open. Created here,
   * not from Paddle.js with price ids, so the org binding is ours. Paddle
   * localizes it to the buyer's country at checkout, the same way the
   * pricing page previewed it.
   */
  createCheckout: orgAdminProcedure
    .input(
      z.object({
        plan: z.enum(["pro", "business"]),
        interval: z.enum(["month", "year"]),
        seats: z.number().int().min(1).max(MAX_SEATS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireBillable(ctx);
      if (ctx.organization.paddleSubscriptionId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: ctx.t("billing.errors.alreadySubscribed"),
        });
      }
      const used = await seatsUsed(ctx);
      if (input.seats < used) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ctx.t("billing.errors.tooFewSeats", { used }),
        });
      }
      const transaction = await getPaddle().transactions.create({
        items: [
          {
            priceId: planToPriceId(prices(), input.plan, input.interval),
            quantity: input.seats,
          },
        ],
        customerId: await customerIdFor(ctx),
        customData: { organizationId: ctx.organization.id },
      });
      return { transactionId: transaction.id };
    }),

  /** Paddle's hosted portal: invoices, payment method, cancellation. */
  portalUrl: orgAdminProcedure.mutation(async ({ ctx }) => {
    const { paddleCustomerId, paddleSubscriptionId } = requireSubscription(ctx);
    const session = await getPaddle().customerPortalSessions.create(
      paddleCustomerId,
      [paddleSubscriptionId],
    );
    const forSubscription = session.urls.subscriptions.find(
      (s) => s.id === paddleSubscriptionId,
    );
    return {
      overview: session.urls.general.overview,
      updatePaymentMethod:
        forSubscription?.updateSubscriptionPaymentMethod ?? null,
      cancel: forSubscription?.cancelSubscription ?? null,
    };
  }),

  /** Seat count on the live subscription, prorated immediately. */
  updateSeats: orgAdminProcedure
    .input(z.object({ seats: z.number().int().min(1).max(MAX_SEATS) }))
    .mutation(async ({ ctx, input }) => {
      requireBillable(ctx);
      const { paddleSubscriptionId } = requireSubscription(ctx);
      const used = await seatsUsed(ctx);
      if (input.seats < used) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: ctx.t("billing.errors.tooFewSeats", { used }),
        });
      }
      const priceId = ctx.organization.paddlePriceId;
      if (!priceId) {
        throw new TRPCError({ code: "PRECONDITION_FAILED" });
      }
      await getPaddle().subscriptions.update(paddleSubscriptionId, {
        items: [{ priceId, quantity: input.seats }],
        prorationBillingMode: "prorated_immediately",
      });
      // The webhook lands the new seat limit; nothing to write here.
      return { ok: true };
    }),

  /** Ends at the period boundary; the webhook downgrades the org then. */
  cancel: orgAdminProcedure.mutation(async ({ ctx }) => {
    requireBillable(ctx);
    const { paddleSubscriptionId } = requireSubscription(ctx);
    await getPaddle().subscriptions.cancel(paddleSubscriptionId, {
      effectiveFrom: "next_billing_period",
    });
    return { ok: true };
  }),
});
