import type { Metadata } from "next";
import { Suspense } from "react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PlanBadge } from "@/features/billing/components/plan-badge";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { OrganizationSettings } from "@/features/organizations/components/organization-settings";
import { api, HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("organizations.settings.title") };
}

/** Members, invitations and the name of the session's active organization. */
export default async function OrganizationSettingsPage() {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  const canEdit =
    current.isAdmin || current.role === "owner" || current.role === "admin";
  const isOwner = current.isAdmin || current.role === "owner";
  prefetch(trpc.organizations.members.list.queryOptions());
  if (canEdit) prefetch(trpc.organizations.invites.list.queryOptions());

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-xl">{current.organization.name}</h1>
          <PlanBadge
            plan={current.organization.plan}
            planSource={current.organization.planSource}
            planExpiresAt={current.organization.planExpiresAt}
          />
          {current.organization.isPersonal && (
            <Badge variant="outline">{t("organizations.personal")}</Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {t("organizations.settings.lead")}
        </p>
      </div>
      <HydrateClient>
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <OrganizationSettings
            canEdit={canEdit}
            isOwner={isOwner}
            isPersonal={current.organization.isPersonal}
            organizationName={current.organization.name}
          />
        </Suspense>
      </HydrateClient>
    </div>
  );
}
