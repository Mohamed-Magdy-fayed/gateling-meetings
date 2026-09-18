import Link from "next/link";

import { BuiltByGateling } from "@/components/brand/built-by-gateling";
import { getT } from "@/features/core/i18n/server";

import { LEGAL_ENTITY } from "../content/types";

const linkClass =
  "text-xs text-muted-foreground transition-colors hover:text-foreground";

/**
 * One quiet row on every page outside a meeting room: who built this, and
 * the policies and contact address card-scheme reviews want reachable from
 * anywhere. The landing page's "who built this" band carries the longer
 * company story; the footer only has to credit and link.
 */
export async function SiteFooter() {
  const { t } = await getT();
  const year = new Date().getFullYear();

  const links = [
    { href: "/pricing", label: t("billing.pricing.nav") },
    { href: "/terms", label: t("legal.footer.terms") },
    { href: "/privacy", label: t("legal.footer.privacy") },
    { href: "/refund-policy", label: t("legal.footer.refunds") },
  ] as const;

  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <BuiltByGateling />
          <p className="text-xs text-muted-foreground" dir="ltr">
            © {year} {t("legal.footer.company")}
          </p>
        </div>
        <nav
          aria-label={t("legal.footer.legal")}
          className="flex flex-wrap items-center gap-x-4 gap-y-1"
        >
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
          <a href={`mailto:${LEGAL_ENTITY.email}`} className={linkClass}>
            {t("legal.footer.contact")}
          </a>
        </nav>
      </div>
    </footer>
  );
}
