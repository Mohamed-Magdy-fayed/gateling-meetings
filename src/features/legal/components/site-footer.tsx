import Link from "next/link";

import { getT } from "@/features/core/i18n/server";

import { LEGAL_ENTITY } from "../content/types";

/**
 * Legal links and a way to reach us, on every page outside a meeting room.
 * Paddle's domain review wants the policies reachable from navigation and
 * contact details within two clicks of the homepage; this is that.
 */
export async function SiteFooter() {
  const { t } = await getT();
  const year = new Date().getFullYear();
  const linkClass =
    "text-muted-foreground transition-colors hover:text-foreground";

  return (
    <footer className="border-t border-border/70">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="font-medium">{t("legal.footer.company")}</p>
          <p className="text-muted-foreground">{t("legal.footer.tagline")}</p>
        </div>
        <nav
          aria-label={t("legal.footer.company")}
          className="flex flex-wrap items-center gap-x-5 gap-y-2"
        >
          <Link href="/pricing" className={linkClass}>
            {t("billing.pricing.nav")}
          </Link>
          <Link href="/terms" className={linkClass}>
            {t("legal.footer.terms")}
          </Link>
          <Link href="/privacy" className={linkClass}>
            {t("legal.footer.privacy")}
          </Link>
          <Link href="/refund-policy" className={linkClass}>
            {t("legal.footer.refunds")}
          </Link>
          <a href={`mailto:${LEGAL_ENTITY.email}`} className={linkClass}>
            {t("legal.footer.contact")}
          </a>
        </nav>
        <p className="text-muted-foreground" dir="ltr">
          © {year} {LEGAL_ENTITY.name}
        </p>
      </div>
    </footer>
  );
}
