"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin", key: "organizations" },
  { href: "/admin/grants", key: "grants" },
  { href: "/admin/users", key: "users" },
  { href: "/settings/integrations", key: "integrations" },
] as const;

export function AdminNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active =
          tab.href === "/admin"
            ? pathname === "/admin" ||
              pathname.startsWith("/admin/organizations")
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t(`admin.tabs.${tab.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
