import { MailIcon, MapPinIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";

import { BuiltByGateling } from "@/components/brand/built-by-gateling";
import { PaymentBrands } from "@/features/billing/components/payment-brands";
import { getT } from "@/features/core/i18n/server";
import { cn } from "@/lib/utils";

import { LEGAL_ENTITY } from "../content/types";

const linkClass =
  "text-xs text-muted-foreground transition-colors hover:text-foreground";

const contactClass = cn(linkClass, "inline-flex items-center gap-1.5");

/**
 * One quiet row on every page outside a meeting room: who built this, and
 * the policies and the contact email, phone and location that card-scheme and
 * Paymob reviews want visible (not just linked) from anywhere. The landing page's "who built this" band carries the longer
 * company story; the footer only has to credit and link.
 */
export async function SiteFooter({ className }: { className?: string }) {
  const { t } = await getT();
  const year = new Date().getFullYear();

  const links = [
    { href: "/pricing", label: t("billing.pricing.nav") },
    { href: "/terms", label: t("legal.footer.terms") },
    { href: "/privacy", label: t("legal.footer.privacy") },
    { href: "/refund-policy", label: t("legal.footer.refunds") },
  ] as const;

  return (
    <footer className={cn("mt-auto border-t border-border", className)}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 pt-5 pb-3 sm:flex-row sm:items-center sm:justify-between">
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
      <address
        aria-label={t("legal.footer.contact")}
        className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-5 gap-y-2 px-4 pb-5 not-italic"
      >
        <a href={`mailto:${LEGAL_ENTITY.email}`} className={contactClass}>
          <MailIcon aria-hidden className="size-3.5 shrink-0" />
          <span dir="ltr">{LEGAL_ENTITY.email}</span>
        </a>
        <a href={`tel:${LEGAL_ENTITY.phone}`} className={contactClass}>
          <PhoneIcon aria-hidden className="size-3.5 shrink-0" />
          <span dir="ltr">{LEGAL_ENTITY.phoneDisplay}</span>
        </a>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPinIcon aria-hidden className="size-3.5 shrink-0" />
          {t("legal.footer.location")}
        </span>
        <PaymentBrands className="sm:ms-auto" />
      </address>
    </footer>
  );
}
