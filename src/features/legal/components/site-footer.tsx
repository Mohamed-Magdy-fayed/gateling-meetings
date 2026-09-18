import { ArrowUpRightIcon } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { BuiltByGateling } from "@/components/brand/built-by-gateling";
import { GatelingMark } from "@/components/brand/gateling-mark";
import { getUserSession } from "@/features/core/auth/core/session";
import { getT } from "@/features/core/i18n/server";

import { LEGAL_ENTITY } from "../content/types";

const linkClass =
  "inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground";

function ExternalLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a href={href} target="_blank" rel="noopener" className={linkClass}>
      {children}
      <ArrowUpRightIcon
        aria-hidden
        className="size-3 opacity-50 rtl:-scale-x-100"
      />
    </a>
  );
}

/**
 * Legal links and a way to reach us, on every page outside a meeting room.
 * Card-scheme and payment-provider reviews want the policies reachable from
 * navigation and contact details within two clicks of the homepage; this is
 * that. It also carries the parent-brand story: who built this and where
 * the rest of Gateling lives.
 */
export async function SiteFooter() {
  const [{ t }, session] = await Promise.all([
    getT(),
    getUserSession(await cookies()),
  ]);
  const year = new Date().getFullYear();
  const site = LEGAL_ENTITY.site;

  const groups = [
    {
      key: "product",
      title: t("legal.footer.groups.product"),
      links: [
        { href: "/", label: t("legal.footer.product.home") },
        { href: "/pricing", label: t("billing.pricing.nav") },
        session
          ? { href: "/dashboard", label: t("legal.footer.product.dashboard") }
          : { href: "/auth/sign-in", label: t("legal.footer.product.signIn") },
      ],
    },
    {
      key: "legal",
      title: t("legal.footer.groups.legal"),
      links: [
        { href: "/terms", label: t("legal.footer.terms") },
        { href: "/privacy", label: t("legal.footer.privacy") },
        { href: "/refund-policy", label: t("legal.footer.refunds") },
      ],
    },
  ] as const;

  const companyLinks = [
    { href: site, label: t("legal.footer.companyLinks.site") },
    { href: `${site}/about`, label: t("legal.footer.companyLinks.about") },
    {
      href: `${site}/services`,
      label: t("legal.footer.companyLinks.services"),
    },
    { href: `${site}/work`, label: t("legal.footer.companyLinks.work") },
  ] as const;

  return (
    <footer className="relative mt-auto overflow-hidden border-t border-border/70 bg-card/60">
      {/* A faint brand glow so the footer reads as the same warm surface as the hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -end-24 size-96 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative mx-auto w-full max-w-5xl px-4 py-12">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div className="col-span-2 space-y-4 md:col-span-1">
            <div className="flex items-center gap-2.5">
              <GatelingMark size={34} />
              <span className="font-display text-lg leading-none tracking-tight">
                <span className="font-bold">{t("logoName")}</span>{" "}
                <span className="text-muted-foreground">
                  {t("brand.product")}
                </span>
              </span>
            </div>
            <p className="max-w-xs text-sm text-muted-foreground text-pretty">
              {t("legal.footer.partOf")}
            </p>
            <BuiltByGateling />
          </div>

          {groups.map((group) => (
            <nav key={group.key} aria-label={group.title} className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.title}
              </p>
              <ul className="space-y-2">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          <nav
            aria-label={t("legal.footer.groups.company")}
            className="space-y-3"
          >
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("legal.footer.groups.company")}
            </p>
            <ul className="space-y-2">
              {companyLinks.map((link) => (
                <li key={link.href}>
                  <ExternalLink href={link.href}>{link.label}</ExternalLink>
                </li>
              ))}
              <li>
                <a href={`mailto:${LEGAL_ENTITY.email}`} className={linkClass}>
                  {t("legal.footer.contact")}
                </a>
              </li>
            </ul>
          </nav>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-border/60 pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
