import { VideoIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { LinkButton } from "@/components/general/link-button";
import { db } from "@/drizzle";
import { resolveEntitlements } from "@/features/billing/plans";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getUserSession } from "@/features/core/auth/core/session";
import { SignOutButton } from "@/features/core/auth/nextjs/components/sign-out-button";
import { LanguageToggle } from "@/features/core/i18n/client";
import { getT } from "@/features/core/i18n/server";
import { OrgSwitcher } from "@/features/organizations/components/org-switcher";
import {
  listUserOrganizations,
  loadActiveOrganization,
} from "@/features/organizations/server/service";

/** Shared top bar for the landing page and the host dashboard. */
export async function SiteHeader() {
  const [{ t }, session] = await Promise.all([
    getT(),
    getUserSession(await cookies()),
  ]);
  const user = session?.user ?? null;
  const isAdmin = isAdminEmail(user?.email);
  // Org owners/admins on a plan with API access get the integrations link;
  // platform admins reach it through /admin instead.
  const [active, memberships] = session
    ? await Promise.all([
        loadActiveOrganization(db, session.user.id, session.orgId ?? null),
        listUserOrganizations(db, session.user.id),
      ])
    : [null, []];
  const canManageIntegrations =
    !isAdmin &&
    active != null &&
    ["owner", "admin"].includes(active.membership.role) &&
    resolveEntitlements(active.organization).apiAccess;

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <Link
          href="/"
          className="flex items-center gap-2 font-display text-base"
        >
          <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground shadow-[var(--shadow-brand-sm)]">
            <VideoIcon className="size-4" />
          </span>
          {t("appName")}
        </Link>
        <nav className="ms-auto flex items-center gap-1">
          <LinkButton href="/pricing" variant="ghost">
            {t("billing.pricing.nav")}
          </LinkButton>
          <LanguageToggle variant="ghost" />
          {user ? (
            <>
              {active && (
                <OrgSwitcher
                  activeId={active.organization.id}
                  organizations={memberships.map(
                    ({ organization, membership }) => ({
                      id: organization.id,
                      name: organization.name,
                      isPersonal: organization.personalOwnerId != null,
                      role: membership.role,
                    }),
                  )}
                />
              )}
              <LinkButton href="/dashboard" variant="ghost">
                {t("meetings.dashboard.title")}
              </LinkButton>
              {canManageIntegrations && (
                <LinkButton href="/settings/integrations" variant="ghost">
                  {t("integrations.admin.title")}
                </LinkButton>
              )}
              {isAdmin && (
                <LinkButton href="/admin" variant="ghost">
                  {t("admin.title")}
                </LinkButton>
              )}
              <SignOutButton variant="ghost" />
            </>
          ) : (
            <LinkButton href="/auth/sign-in" variant="outline">
              {t("auth.signIn.submit")}
            </LinkButton>
          )}
        </nav>
      </div>
    </header>
  );
}
