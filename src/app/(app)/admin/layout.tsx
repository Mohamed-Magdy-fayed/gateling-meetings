import type { PropsWithChildren } from "react";

import { AdminNav } from "@/features/admin/components/admin-nav";
import { requireAdmin } from "@/features/core/auth/nextjs/admin";
import { getT } from "@/features/core/i18n/server";

/** One guard for every admin page; a non-admin sees a 404, not a 403. */
export default async function AdminLayout({ children }: PropsWithChildren) {
  await requireAdmin();
  const { t } = await getT();

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-xl">{t("admin.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("admin.lead")}</p>
      </div>
      <AdminNav />
      {children}
    </div>
  );
}
