import { ArrowUpRightIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { BuiltByGateling } from "@/components/brand/built-by-gateling";
import { GatelingMark } from "@/components/brand/gateling-mark";
import { getUserSession } from "@/features/core/auth/core/session";
import { getT } from "@/features/core/i18n/server";

import { LEGAL_ENTITY } from "../content/types";

const linkClass =
  "inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/**
 * Legal links and a way to reach us, on every page outside a meeting room.
 * Card-scheme and payment-provider reviews want the policies reachable from
 * navigation and contact details within two clicks of the homepage; this is
 * that. Kept to two compact rows — an app's footer, not a marketing site's —
 * with the parent-brand credit and the gateling.com links on the second row.
 */
export async function SiteFooter() {
  const [{ t }, session] = await Promise.all([
    getT(),
    getUserSession(await cookies()),
  ]);
  const year = new Date().getFullYear();
  const site = LEGAL_ENTITY.site;

  const productLinks = [
    { href: "/pricing", label: t("billing.pricing.nav") },
    session
      ? { href: "/dashboard", label: t("legal.footer.product.dashboard") }
      : { href: "/auth/sign-in", label: t("legal.footer.product.signIn") },
    { href: "/terms", label: t("legal.footer.terms") },
    { href: "/privacy", label: t("legal.footer.privacy") },
    { href: "/refund-policy", label: t("legal.footer.refunds") },
  ] as const;

  const companyLinks = [
    { href: `${site}/about`, label: t("legal.footer.companyLinks.about") },
    {
      href: `${site}/services`,
      label: t("legal.footer.companyLinks.services"),
    },
    { href: `${site}/work`, label: t("legal.footer.companyLinks.work") },
  ] as const;

  return (
    <footer className="mt-auto border-t-2 border-primary/70 bg-card">
      <div className="mx-auto w-full max-w-5xl px-4">
        {/* Row 1: the product and its own pages. */}
        <div className="flex flex-col gap-4 py-6 md:flex-row md:items-center md:justify-between">
          <div className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
            <GatelingMark size={28} />
            <span className="font-display text-base leading-none tracking-tight">
              <span className="font-bold">{t("logoName")}</span>{" "}
              <span className="text-muted-foreground">
                {t("brand.product")}
              </span>
            </span>
            <span className="ms-2 hidden text-sm text-muted-foreground lg:inline">
              {t("legal.footer.tagline")}
            </span>
          </div>
          <nav
            aria-label={t("legal.footer.groups.product")}
            className="-ms-2.5 flex flex-wrap items-center gap-x-1 gap-y-1 md:justify-end"
          >
            {productLinks.map((link) => (
              <Link key={link.href} href={link.href} className={linkClass}>
                {link.label}
              </Link>
            ))}
            <a href={`mailto:${LEGAL_ENTITY.email}`} className={linkClass}>
              {t("legal.footer.contact")}
            </a>
          </nav>
        </div>

        {/* Row 2: who built it, and the rest of Gateling. */}
        <div className="flex flex-col gap-4 border-t border-border py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <BuiltByGateling />
            <p className="max-w-sm text-xs text-muted-foreground">
              {t("legal.footer.partOf")}
            </p>
          </div>
          <nav
            aria-label={t("legal.footer.groups.company")}
            className="-ms-2.5 flex shrink-0 flex-wrap items-center gap-x-1"
          >
            {companyLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener"
                className={linkClass}
              >
                {link.label}
                <ArrowUpRightIcon
                  aria-hidden
                  className="size-3 opacity-50 rtl:-scale-x-100"
                />
              </a>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-1 border-t border-border py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p dir="ltr">
            © {year} {t("legal.footer.company")}. {t("legal.footer.rights")}
          </p>
          <Link
            href="/"
            className="font-mono transition-colors hover:text-foreground"
            dir="ltr"
          >
            meetings.gateling.com
          </Link>
        </div>
      </div>
    </footer>
  );
}
