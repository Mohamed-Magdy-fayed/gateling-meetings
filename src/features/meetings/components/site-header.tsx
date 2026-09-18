import { cookies } from "next/headers";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { LinkButton } from "@/components/general/link-button";
import { db } from "@/drizzle";
import { resolveEntitlements } from "@/features/billing/plans";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getUserSession } from "@/features/core/auth/core/session";
import { SignOutButton } from "@/features/core/auth/nextjs/components/sign-out-button";
import { ThemeToggle } from "@/features/core/color-theme/client";
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
  // Org owners/admins on a plan with API access get the integrations entry
  // in the org menu; platform admins always do.
  const [active, memberships] = session
    ? await Promise.all([
        loadActiveOrganization(db, session.user.id, session.orgId ?? null),
        listUserOrganizations(db, session.user.id),
      ])
    : [null, []];
  const canManageIntegrations =
    active != null &&
    (isAdmin ||
      (["owner", "admin"].includes(active.membership.role) &&
        resolveEntitlements(active.organization).apiAccess));

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 px-4">
        <BrandLockup />
        <nav className="ms-auto flex items-center gap-1">
          <LinkButton href="/pricing" variant="ghost">
            {t("billing.pricing.nav")}
          </LinkButton>
          <ThemeToggle />
          <LanguageToggle variant="ghost" />
          {user ? (
            <>
              {active && (
                <OrgSwitcher
                  activeId={active.organization.id}
                  showIntegrations={canManageIntegrations}
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
