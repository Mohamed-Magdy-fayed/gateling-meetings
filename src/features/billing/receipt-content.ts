import { escapeHtml } from "@/features/core/auth/emails/base-email";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";
import { LEGAL_ENTITY } from "@/features/legal/content/types";
import { formatMoney } from "./components/format-money";

/** Everything a receipt shows; copied from the ledger row, never from a PAN. */
export type ReceiptInput = {
  kind: "payment" | "refund" | "void";
  providerTransactionId: string;
  parentTransactionId: string | null;
  occurredAt: Date;
  amountCents: number;
  currency: string;
  plan: string | null;
  interval: string | null;
  seats: number | null;
  cardBrand: string | null;
  cardLast4: string | null;
  organizationName: string | null;
};

export type ReceiptEmail = { subject: string; text: string; html: string };

const RECEIPT_LOCALES = ["en", "ar"] as const;
type ReceiptLocale = (typeof RECEIPT_LOCALES)[number];

/** Receipts are dated in Egypt time, where the merchant is. */
const RECEIPT_TIME_ZONE = "Africa/Cairo";

const PLAN_NAMES: Record<string, `billing.plans.${string}.name`> = {
  free: "billing.plans.free.name",
  pro: "billing.plans.pro.name",
  business: "billing.plans.business.name",
  unlimited: "billing.plans.unlimited.name",
};

type Section = {
  dir: "ltr" | "rtl";
  heading: string;
  intro: string;
  rows: [label: string, value: string][];
  notes: string[];
};

function section(input: ReceiptInput, locale: ReceiptLocale): Section {
  const { t } = createI18n(mainTranslations, locale, "en");
  const isPayment = input.kind === "payment";
  const amount = formatMoney(input.amountCents, input.currency, locale);
  const date = new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: RECEIPT_TIME_ZONE,
    timeZoneName: "short",
  }).format(input.occurredAt);

  const planKey = input.plan ? PLAN_NAMES[input.plan] : undefined;
  const description = !isPayment
    ? t(
        input.kind === "void"
          ? "billing.receipt.voidOf"
          : "billing.receipt.refundOf",
      )
    : planKey && (input.interval === "month" || input.interval === "year")
      ? t("billing.receipt.planLine", {
          plan: t(planKey as "billing.plans.pro.name"),
          seats: String(input.seats ?? 1),
          period: t(`billing.receipt.planPeriod.${input.interval}`),
        })
      : t("billing.receipt.cardUpdate");

  const card =
    input.cardLast4 != null
      ? t("billing.receipt.card", {
          brand: input.cardBrand ?? t("billing.receipt.cardUnknown"),
          last4: input.cardLast4,
        })
      : (input.cardBrand ?? t("billing.receipt.cardUnknown"));

  const rows: [string, string][] = [
    [t("billing.receipt.merchant"), LEGAL_ENTITY.name],
    [t("billing.receipt.transactionId"), input.providerTransactionId],
  ];
  if (!isPayment && input.parentTransactionId) {
    rows.push([
      t("billing.receipt.originalTransaction"),
      input.parentTransactionId,
    ]);
  }
  rows.push(
    [t("billing.receipt.date"), date],
    [t("billing.receipt.amount"), amount],
    [t("billing.receipt.description"), description],
    [t("billing.receipt.paymentMethod"), card],
  );
  if (input.organizationName) {
    rows.push([t("billing.receipt.organization"), input.organizationName]);
  }

  const notes: string[] = [];
  if (isPayment && input.plan) {
    notes.push(
      t("billing.receipt.renewalNote", {
        url: `${LEGAL_ENTITY.productUrl}/settings/billing`,
      }),
    );
  }
  notes.push(t("billing.receipt.contact", { email: LEGAL_ENTITY.email }));

  const variant = isPayment ? "payment" : "refund";
  return {
    dir: locale === "ar" ? "rtl" : "ltr",
    heading: t(`billing.receipt.heading.${variant}`),
    intro: t(`billing.receipt.intro.${variant}`, {
      product: LEGAL_ENTITY.product,
    }),
    rows,
    notes,
  };
}

function sectionText(s: Section): string {
  return [
    s.heading,
    "",
    s.intro,
    "",
    ...s.rows.map(([label, value]) => `${label}: ${value}`),
    "",
    ...s.notes,
  ].join("\n");
}

function sectionHtml(s: Section): string {
  const align = s.dir === "rtl" ? "right" : "left";
  const rows = s.rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#555555;font-size:14px;width:40%;vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 0;font-size:14px;font-weight:600;" dir="auto">${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  const notes = s.notes
    .map(
      (note) =>
        `<p style="font-size:13px;color:#444444;margin:8px 0;">${escapeHtml(note)}</p>`,
    )
    .join("");
  return `<div dir="${s.dir}" style="text-align:${align};padding:8px 0 24px;">
  <h2 style="font-size:18px;margin:0 0 8px;">${escapeHtml(s.heading)}</h2>
  <p style="font-size:15px;margin:0 0 16px;">${escapeHtml(s.intro)}</p>
  <table role="presentation" width="100%" style="border-collapse:collapse;">${rows}</table>
  ${notes}
</div>`;
}

/**
 * One email carrying the receipt in English and in Arabic — the app does
 * not know the payer's language at callback time, and a receipt must be
 * readable by whoever opens it. Pure: no database, no SMTP.
 */
export function buildReceiptEmail(input: ReceiptInput): ReceiptEmail {
  const sections = RECEIPT_LOCALES.map((locale) => section(input, locale));
  const variant = input.kind === "payment" ? "payment" : "refund";
  const amount = formatMoney(input.amountCents, input.currency, "en");
  const { t } = createI18n(mainTranslations, "en", "en");
  const subject = t(`billing.receipt.subject.${variant}`, { amount });
  const footer = t("billing.receipt.footer", {
    merchant: LEGAL_ENTITY.name,
    site: LEGAL_ENTITY.productUrl,
  });

  const text = [...sections.map(sectionText), footer].join("\n\n— — —\n\n");
  const html = `<!doctype html>
<html>
  <body style="background-color:#ffffff;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111111;">
    <div style="max-width:560px;margin:0 auto;padding:24px;">
      ${sections.map(sectionHtml).join('<hr style="border:none;border-top:1px solid #eeeeee;margin:8px 0 16px;" />')}
      <p style="border-top:1px solid #eeeeee;padding-top:16px;font-size:12px;color:#666666;">${escapeHtml(footer)}</p>
    </div>
  </body>
</html>`;
  return { subject, text, html };
}
