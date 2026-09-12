import { VideoIcon } from "lucide-react";
import Link from "next/link";

import { LinkButton } from "@/components/general/link-button";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { SignOutButton } from "@/features/core/auth/nextjs/components/sign-out-button";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { LanguageToggle } from "@/features/core/i18n/client";
import { getT } from "@/features/core/i18n/server";

/** Shared top bar for the landing page and the host dashboard. */
export async function SiteHeader() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);

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
          <LanguageToggle variant="ghost" />
          {user ? (
            <>
              <LinkButton href="/dashboard" variant="ghost">
                {t("meetings.dashboard.title")}
              </LinkButton>
              {isAdminEmail(user.email) && (
                <LinkButton href="/settings/integrations" variant="ghost">
                  {t("integrations.admin.title")}
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
