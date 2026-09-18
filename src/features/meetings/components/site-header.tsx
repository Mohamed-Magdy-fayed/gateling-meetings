import { cookies } from "next/headers";

import { BrandLockup } from "@/components/brand/brand-lockup";
import { LinkButton } from "@/components/general/link-button";
import { db } from "@/drizzle";
import { resolveEntitlements } from "@/features/billing/plans";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getUserSession } from "@/features/core/auth/core/session";
import { ThemeToggle } from "@/features/core/color-theme/client";
import { LanguageToggle } from "@/features/core/i18n/client";
import { getT } from "@/features/core/i18n/server";
import { OrgSwitcher } from "@/features/organizations/components/org-switcher";
import {
  listUserOrganizations,
  loadActiveOrganization,
} from "@/features/organizations/server/service";

import { HeaderNewMeeting } from "./header-new-meeting";

/**
 * Shared top bar for the landing page and the host dashboard. Built like a
 * meetings app, not a marketing site: the lockup, one primary action (start
 * a meeting), and a single account menu that holds navigation, org
 * switching, settings and sign-out.
 */
export async function SiteHeader() {
  const [{ t }, session] = await Promise.all([
    getT(),
    getUserSession(await cookies()),
  ]);
  const user = session?.user ?? null;
  const isAdmin = isAdminEmail(user?.email);
  // Org owners/admins on a plan with API access get the integrations entry
  // in the account menu; platform admins always do.
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
    <header className="sticky top-0 z-20 px-4 pt-3">
      {/* A floating pill, detached from the page edge: the app's own chrome rather than a site nav. */}
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center gap-3 rounded-full border border-border bg-card/85 pe-2 ps-4 shadow-md backdrop-blur supports-[backdrop-filter]:bg-card/75">
        <BrandLockup />
        <nav className="ms-auto flex items-center gap-1.5">
          <LinkButton
            href="/pricing"
            variant="ghost"
            className="hidden md:inline-flex"
          >
            {t("billing.pricing.nav")}
          </LinkButton>
          <ThemeToggle />
          <LanguageToggle variant="ghost" />
          {user && active ? (
            <>
              <HeaderNewMeeting />
              <OrgSwitcher
                activeId={active.organization.id}
                showIntegrations={canManageIntegrations}
                isAdmin={isAdmin}
                organizations={memberships.map(
                  ({ organization, membership }) => ({
                    id: organization.id,
                    name: organization.name,
                    isPersonal: organization.personalOwnerId != null,
                    role: membership.role,
                  }),
                )}
              />
            </>
          ) : (
            <LinkButton href="/auth/sign-in" className="ms-1">
              {t("auth.signIn.submit")}
            </LinkButton>
          )}
        </nav>
      </div>
    </header>
  );
}
