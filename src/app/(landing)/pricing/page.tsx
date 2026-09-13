import type { Metadata } from "next";
import { cookies } from "next/headers";

import { isBillingConfigured } from "@/data/env/server";
import { db } from "@/drizzle";
import { PaddleProvider } from "@/features/billing/components/paddle-provider";
import { PricingTable } from "@/features/billing/components/pricing-table";
import { resolveEntitlements } from "@/features/billing/plans";
import { getUserSession } from "@/features/core/auth/core";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getT } from "@/features/core/i18n/server";
import { loadActiveOrganization } from "@/features/organizations/server/service";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("billing.pricing.title") };
}

export default async function PricingPage() {
  const [{ t }, session] = await Promise.all([
    getT(),
    getUserSession(await cookies()),
  ]);
  const active = session
    ? await loadActiveOrganization(db, session.user.id, session.orgId ?? null)
    : null;
  const currentPlan = active
    ? resolveEntitlements(active.organization).effectivePlan
    : null;
  // Mirrors `billing.summary.canCheckout`: someone who may buy for an org
  // that has nothing hand-granted and no subscription yet.
  const canCheckout =
    isBillingConfigured &&
    active != null &&
    session != null &&
    (isAdminEmail(session.user.email) ||
      ["owner", "admin"].includes(active.membership.role)) &&
    active.organization.planSource !== "manual" &&
    active.organization.planSource !== "trial" &&
    !active.organization.paddleSubscriptionId;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 md:py-16">
      <div className="mb-10 space-y-3 text-center">
        <h1 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
          {t("billing.pricing.title")}
        </h1>
        <p className="mx-auto max-w-prose text-muted-foreground text-pretty">
          {t("billing.pricing.lead")}
        </p>
      </div>
      <PaddleProvider>
        <PricingTable
          currentPlan={currentPlan}
          isSignedIn={session != null}
          canCheckout={canCheckout}
        />
      </PaddleProvider>
      <p className="mt-10 text-center text-sm text-muted-foreground">
        {t("billing.pricing.contactLead")}
      </p>
    </main>
  );
}
