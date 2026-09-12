import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { requireAdmin } from "@/features/core/auth/nextjs/admin";
import { getT } from "@/features/core/i18n/server";
import { CreateIntegrationDialog } from "@/features/integrations/components/create-integration-dialog";
import { IntegrationsList } from "@/features/integrations/components/integrations-list";
import { WebhookDeliveries } from "@/features/integrations/components/webhook-deliveries";
import { HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("integrations.admin.title") };
}

export default async function IntegrationsPage() {
  await requireAdmin();
  const { t } = await getT();
  prefetch(trpc.integrations.list.queryOptions());
  prefetch(trpc.integrations.deliveries.queryOptions({}));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-xl">
            {t("integrations.admin.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("integrations.admin.lead")}
          </p>
        </div>
        <CreateIntegrationDialog />
      </div>

      <HydrateClient>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <IntegrationsList />
        </Suspense>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("integrations.admin.deliveries")}
          </h2>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <WebhookDeliveries />
          </Suspense>
        </section>
      </HydrateClient>
    </div>
  );
}
