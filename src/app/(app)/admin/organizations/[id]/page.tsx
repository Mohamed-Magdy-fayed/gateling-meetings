import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { Skeleton } from "@/components/ui/skeleton";
import { OrganizationDetail } from "@/features/admin/components/organization-detail";
import { getT } from "@/features/core/i18n/server";
import { HydrateClient, prefetch, trpc } from "@/integrations/trpc/server";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("admin.title")} · ${t("admin.tabs.organizations")}` };
}

export default async function AdminOrganizationPage({ params }: Params) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  prefetch(trpc.admin.organizations.get.queryOptions({ id }));

  return (
    <HydrateClient>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <OrganizationDetail id={id} />
      </Suspense>
    </HydrateClient>
  );
}
