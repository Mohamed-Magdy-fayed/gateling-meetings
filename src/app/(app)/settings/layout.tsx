import type { PropsWithChildren } from "react";

import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import {
  SettingsNav,
  type SettingsTabKey,
} from "@/features/settings/components/settings-nav";
import { api } from "@/integrations/trpc/server";

/**
 * One frame for the organization, billing and integrations pages, so the
 * three read as sections of the same place rather than three unrelated
 * screens. The integrations tab only appears for people who may open it —
 * the page itself still 404s anyone who reaches it another way.
 */
export default async function SettingsLayout({ children }: PropsWithChildren) {
  await getCurrentUser({ redirectIfNotFound: true });
  const [{ t }, current] = await Promise.all([
    getT(),
    api().then((caller) => caller.organizations.current()),
  ]);
  const canManage =
    current.isAdmin || current.role === "owner" || current.role === "admin";
  const tabs: SettingsTabKey[] = ["account", "organization", "billing"];
  if (canManage) tabs.push("integrations");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-1">
        <h1 className="font-display text-2xl tracking-tight">
          {t("settings.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{t("settings.lead")}</p>
      </div>
      <SettingsNav tabs={tabs} />
      {children}
    </div>
  );
}
