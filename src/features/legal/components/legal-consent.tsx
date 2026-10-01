"use client";

import Link from "next/link";
import { Fragment } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { cn } from "@/lib/utils";

const LINKS = {
  terms: { href: "/terms", key: "billing.checkout.termsLink" },
  refunds: { href: "/refund-policy", key: "billing.checkout.refundsLink" },
  privacy: { href: "/privacy", key: "billing.checkout.privacyLink" },
} as const;

type LinkName = keyof typeof LINKS;

/** Survives interpolation untouched and never appears in real copy. */
const marker = (name: LinkName) => `⁣${name}⁣`;
const MARKER_PATTERN = /⁣(terms|refunds|privacy)⁣/;

/**
 * "By continuing you agree to the Terms … Refund policy … Privacy" with
 * real links, word order owned by each translation: the sentence is
 * interpolated with marker tokens, then split on them. Links open in a
 * new tab so reading a policy never loses the checkout dialog.
 */
export function LegalConsent({
  messageKey = "billing.checkout.consent",
  className,
}: {
  messageKey?: "billing.checkout.consent" | "auth.signUp.consent";
  className?: string;
}) {
  const { t } = useTranslation();
  const sentence = t(messageKey, {
    terms: marker("terms"),
    refunds: marker("refunds"),
    privacy: marker("privacy"),
  });
  const parts = sentence.split(MARKER_PATTERN);

  return (
    <p className={cn("text-xs text-muted-foreground text-pretty", className)}>
      {parts.map((part, index) => {
        // `split` with a capture group puts the captured names at odd
        // indexes. The parts come from one fixed sentence and never reorder.
        if (index % 2 === 0) {
          // biome-ignore lint/suspicious/noArrayIndexKey: static, never reordered
          return <Fragment key={`text-${index}`}>{part}</Fragment>;
        }
        const link = LINKS[part as LinkName];
        return (
          <Link
            key={part}
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {t(link.key)}
          </Link>
        );
      })}
    </p>
  );
}
