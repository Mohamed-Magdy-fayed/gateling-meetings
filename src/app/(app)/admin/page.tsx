import type { Metadata } from "next";

import { OrganizationsTable } from "@/features/admin/components/organizations-table";
import { getT } from "@/features/core/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("admin.title")} · ${t("admin.tabs.organizations")}` };
}

export default function AdminOrganizationsPage() {
  return <OrganizationsTable />;
}
