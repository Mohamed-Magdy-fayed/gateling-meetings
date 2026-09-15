import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { BillingSummary } from "@/features/billing/components/billing-summary";
import { PaddleProvider } from "@/features/billing/components/paddle-provider";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { api, HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("billing.settings.title") };
}

/**
 * What the active organization is on, what that allows, and — for its
 * owners and admins — the checkout, seat count and Paddle portal. Only
 * this page and `/pricing` may frame Paddle (see `proxy.ts`).
 */
export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string }>;
}) {
  await getCurrentUser({ redirectIfNotFound: true });
  const { portal } = await searchParams;
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  prefetch(trpc.billing.summary.queryOptions());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-xl">{t("billing.settings.title")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("billing.settings.lead", { name: current.organization.name })}
        </p>
      </div>
      <PaddleProvider customerId={current.organization.paddleCustomerId}>
        <HydrateClient>
          <Suspense fallback={<Skeleton className="h-64 w-full" />}>
            <BillingSummary portalUnavailable={portal === "unavailable"} />
          </Suspense>
        </HydrateClient>
      </PaddleProvider>
    </div>
  );
}
