import type { Metadata } from "next";

import { UsersTable } from "@/features/admin/components/users-table";
import { getT } from "@/features/core/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: `${t("admin.title")} · ${t("admin.tabs.users")}` };
}

export default function AdminUsersPage() {
  return <UsersTable />;
}
