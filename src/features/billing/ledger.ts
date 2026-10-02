/**
 * Pure rules about recorded transactions: the refund window, fee
 * estimates for reconciliation, and the CSV a Paymob inspection request
 * is answered with. No database, no env — unit-tested directly.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Paymob refunds a card payment only within this many days of the charge. */
export const REFUND_WINDOW_DAYS = 90;

export function refundDeadline(occurredAt: Date): Date {
  return new Date(occurredAt.getTime() + REFUND_WINDOW_DAYS * DAY_MS);
}

export function isPastRefundWindow(occurredAt: Date, now: Date): boolean {
  return now.getTime() > refundDeadline(occurredAt).getTime();
}

/**
 * Paymob's contracted fees, per successful transaction: 2.4% + EGP 3 for
 * Egyptian cards and wallets, 2.6% + EGP 3 for foreign cards. The callback
 * does not reliably say which a card is, so the export uses the local
 * rate and says it is an estimate — Paymob's settlement report is the
 * source of truth for what was actually deducted.
 */
export const PAYMOB_FEES = {
  local: { percent: 2.4, fixedCents: 300 },
  foreign: { percent: 2.6, fixedCents: 300 },
} as const;

export function estimatePaymobFeeCents(
  amountCents: number,
  scheme: keyof typeof PAYMOB_FEES = "local",
): number {
  const { percent, fixedCents } = PAYMOB_FEES[scheme];
  return Math.round((amountCents * percent) / 100) + fixedCents;
}

/**
 * Whether what the provider says it charged is exactly what we asked it
 * to charge. Currency codes are compared case-insensitively.
 */
export function chargeMatches(
  charged: { amountCents: number; currency: string },
  expected: { amountCents: number; currency: string },
): boolean {
  return (
    charged.amountCents === expected.amountCents &&
    charged.currency.toUpperCase() === expected.currency.toUpperCase()
  );
}

/**
 * Paymob reports refunds by re-sending the original payment with a running
 * `refunded_amount_cents` (and `is_voided` for a void). Compared with what
 * the ledger already holds, this is the new money that went back — or
 * `null` when the report adds nothing (a redelivery, an older update).
 * A report that says "refunded" without an amount is taken as in full.
 */
export function reversalFromReport(
  payment: {
    amountCents: number;
    refundedAmountCents: number;
    voided: boolean;
  },
  report: { refundedAmountCents: number | null; voided: boolean },
): {
  kind: "refund" | "void";
  amountCents: number;
  refundedTotal: number;
} | null {
  if (report.voided) {
    if (payment.voided) return null;
    const amountCents = payment.amountCents - payment.refundedAmountCents;
    return amountCents > 0
      ? { kind: "void", amountCents, refundedTotal: payment.amountCents }
      : null;
  }
  const reported = report.refundedAmountCents ?? payment.amountCents;
  const refundedTotal = Math.min(payment.amountCents, Math.max(0, reported));
  const amountCents = refundedTotal - payment.refundedAmountCents;
  return amountCents > 0
    ? { kind: "refund", amountCents, refundedTotal }
    : null;
}

export type LedgerCsvRow = {
  occurredAt: Date;
  providerTransactionId: string;
  kind: "payment" | "refund" | "void";
  status: "succeeded" | "failed";
  parentTransactionId: string | null;
  organizationId: string | null;
  organizationName: string | null;
  customerEmail: string | null;
  plan: string | null;
  interval: string | null;
  seats: number | null;
  amountCents: number;
  currency: string;
  refundedAmountCents: number;
  cardBrand: string | null;
  cardLast4: string | null;
};

const CSV_HEADER = [
  "occurred_at_utc",
  "transaction_id",
  "kind",
  "status",
  "parent_transaction_id",
  "organization_id",
  "organization_name",
  "customer_email",
  "plan",
  "interval",
  "seats",
  "currency",
  "amount",
  "refunded_amount",
  "estimated_paymob_fee",
  "estimated_net",
  "card",
];

/**
 * RFC 4180 quoting, plus a leading `'` on anything a spreadsheet would
 * run as a formula — the org name and email are user-supplied.
 */
export function csvCell(value: string | number | null): string {
  if (value == null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Fee and net only for money that actually moved in: a successful
 * payment. Refunds and voids carry their own (positive) amount and the
 * reader nets them off; Paymob does not return its fee on a refund.
 */
export function ledgerToCsv(rows: readonly LedgerCsvRow[]): string {
  const lines = rows.map((row) => {
    const isIncome = row.kind === "payment" && row.status === "succeeded";
    const fee = isIncome ? estimatePaymobFeeCents(row.amountCents) : null;
    const card =
      row.cardBrand || row.cardLast4
        ? `${row.cardBrand ?? "card"} ${row.cardLast4 ? `•••• ${row.cardLast4}` : ""}`.trim()
        : null;
    return [
      row.occurredAt.toISOString(),
      row.providerTransactionId,
      row.kind,
      row.status,
      row.parentTransactionId,
      row.organizationId,
      row.organizationName,
      row.customerEmail,
      row.plan,
      row.interval,
      row.seats,
      row.currency,
      money(row.amountCents),
      money(row.refundedAmountCents),
      fee == null ? null : money(fee),
      fee == null ? null : money(row.amountCents - fee),
      card,
    ]
      .map(csvCell)
      .join(",");
  });
  return `${[CSV_HEADER.join(","), ...lines].join("\r\n")}\r\n`;
}
