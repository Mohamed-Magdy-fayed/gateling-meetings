"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

export type SettingsTabKey =
  | "account"
  | "organization"
  | "billing"
  | "integrations";

type SettingsNavProps = {
  /** Which tabs this person may open; the layout decides from role + plan. */
  tabs: readonly SettingsTabKey[];
};

const HREFS: Record<SettingsTabKey, string> = {
  account: "/settings/account",
  organization: "/settings/organization",
  billing: "/settings/billing",
  integrations: "/settings/integrations",
};

/** Underline tabs across the settings pages, the same shape as the admin nav. */
export function SettingsNav({ tabs }: SettingsNavProps) {
  const { t } = useTranslation();
  const pathname = usePathname();

  return (
    <nav aria-label={t("settings.title")} className="border-b border-border">
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {tabs.map((key) => {
          const href = HREFS[key];
          const isActive = pathname.startsWith(href);
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors",
                  isActive
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                )}
              >
                {t(`settings.tabs.${key}`)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
