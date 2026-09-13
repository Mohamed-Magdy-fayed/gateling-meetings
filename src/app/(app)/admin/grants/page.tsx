import type { Metadata } from "next";

import { CreatePlanGrantDialog } from "@/features/admin/components/create-plan-grant-dialog";
import { PlanGrantsTable } from "@/features/admin/components/plan-grants-table";
import { getT } from "@/features/core/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("admin.title")} · ${t("admin.tabs.grants")}` };
}

export default async function AdminGrantsPage() {
  const { t } = await getT();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-prose text-sm text-muted-foreground">
          {t("admin.grants.lead")}
        </p>
        <CreatePlanGrantDialog />
      </div>
      <PlanGrantsTable />
    </div>
  );
}
