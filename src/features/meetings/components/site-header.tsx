import { BrandLockup } from "@/components/brand/brand-lockup";
import { LinkButton } from "@/components/general/link-button";
import { ThemeToggle } from "@/features/core/color-theme/client";
import { LanguageToggle } from "@/features/core/i18n/client";
import { getT } from "@/features/core/i18n/server";
import { OrgSwitcher } from "@/features/organizations/components/org-switcher";
import { loadAccountMenu } from "@/features/organizations/server/account-menu";

import { HeaderNewMeeting } from "./header-new-meeting";

/**
 * Shared top bar for the landing page and the host dashboard. Built like a
 * meetings app, not a marketing site: the lockup, one primary action (start
 * a meeting), and a single account menu that holds navigation, org
 * switching, settings and sign-out. On phones the account menu and the
 * primary action live in the bottom bar instead, so the header keeps only
 * the lockup and the two global toggles.
 */
export async function SiteHeader() {
  const [{ t }, menu] = await Promise.all([getT(), loadAccountMenu()]);

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
          {menu ? (
            <>
              <HeaderNewMeeting />
              <div className="hidden md:block">
                <OrgSwitcher {...menu} />
              </div>
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
