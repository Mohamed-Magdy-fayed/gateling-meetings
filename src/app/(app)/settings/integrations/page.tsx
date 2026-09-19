import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LinkButton } from "@/components/general/link-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { baseUrl } from "@/data/env/server";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { AgentConnectCard } from "@/features/integrations/components/agent-connect-card";
import { CreateIntegrationDialog } from "@/features/integrations/components/create-integration-dialog";
import { IntegrationsList } from "@/features/integrations/components/integrations-list";
import { WebhookDeliveries } from "@/features/integrations/components/webhook-deliveries";
import { api, HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("integrations.admin.title") };
}

/**
 * Self-serve API keys for the active organization's owners and admins.
 * Without `apiAccess` on the plan the page is an upgrade prompt; a plain
 * member gets a 404, the same as any page that is not theirs to see.
 */
export default async function IntegrationsPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  const canManage =
    current.isAdmin || current.role === "owner" || current.role === "admin";
  if (!canManage) notFound();

  if (!current.isAdmin && !current.entitlements.apiAccess) {
    return (
      <div>
        <Card>
          <CardHeader>
            <CardTitle>{t("integrations.admin.title")}</CardTitle>
            <CardDescription>
              {t("integrations.admin.upgradeLead")}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <LinkButton href="/settings/billing">
              {t("billing.pricing.upgrade")}
            </LinkButton>
            <LinkButton href="/pricing" variant="outline">
              {t("billing.settings.comparePlans")}
            </LinkButton>
          </CardContent>
        </Card>
      </div>
    );
  }

  prefetch(trpc.integrations.list.queryOptions());
  prefetch(trpc.integrations.deliveries.queryOptions({}));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-xl">
            {t("integrations.admin.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("integrations.admin.lead")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/settings/integrations/docs" variant="outline">
            {t("integrations.admin.readDocs")}
          </LinkButton>
          <CreateIntegrationDialog isPlatformAdmin={current.isAdmin} />
        </div>
      </div>

      <HydrateClient>
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <IntegrationsList />
        </Suspense>
        <AgentConnectCard mcpUrl={`${baseUrl}/api/mcp`} />
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("integrations.admin.deliveries")}
          </h3>
          <Suspense fallback={<Skeleton className="h-24 w-full" />}>
            <WebhookDeliveries />
          </Suspense>
        </section>
      </HydrateClient>
    </div>
  );
}
