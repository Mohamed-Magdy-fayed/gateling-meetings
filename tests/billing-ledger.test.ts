import { describe, expect, it } from "vitest";

import {
  chargeMatches,
  csvCell,
  estimatePaymobFeeCents,
  isPastRefundWindow,
  type LedgerCsvRow,
  ledgerToCsv,
  REFUND_WINDOW_DAYS,
  refundDeadline,
} from "@/features/billing/ledger";
import { buildReceiptEmail } from "@/features/billing/receipt-content";
import {
  lastFour,
  PAYMOB_EVENT_TYPES,
  parsePaymobEvent,
  transactionEventId,
} from "@/integrations/paymob/events";

const DAY = 24 * 60 * 60 * 1000;
const PAID_AT = new Date("2026-09-01T10:00:00Z");

const payment = {
  type: "TRANSACTION",
  obj: {
    id: 9001,
    pending: false,
    success: true,
    amount_cents: 447_00,
    currency: "EGP",
    created_at: PAID_AT.toISOString(),
    is_refunded: false,
    is_voided: false,
    order: { id: 77, merchant_order_id: "bc_ref" },
    source_data: { pan: "2346", sub_type: "Visa", type: "card" },
  },
};

describe("refund and void callbacks", () => {
  it("reads a refund as a reversal of its parent, not a payment", () => {
    const parsed = parsePaymobEvent(PAYMOB_EVENT_TYPES.transaction, {
      ...payment,
      obj: {
        ...payment.obj,
        id: 9002,
        amount_cents: 100_00,
        is_refund: true,
        parent_transaction: 9001,
      },
    });
    expect(parsed).toMatchObject({
      kind: "transaction",
      transactionKind: "refund",
      parentTransactionId: "9001",
      reversed: false,
      success: true,
      amountCents: 100_00,
      // Same order as the payment: this is why it must not reach the
      // checkout path that grants the plan.
      providerOrderId: "77",
    });
  });

  it("reads a void as a void", () => {
    const parsed = parsePaymobEvent(PAYMOB_EVENT_TYPES.transaction, {
      ...payment,
      obj: {
        ...payment.obj,
        id: 9003,
        is_void: true,
        parent_transaction: 9001,
      },
    });
    expect(parsed).toMatchObject({
      transactionKind: "void",
      parentTransactionId: "9001",
    });
  });

  it("flags a payment re-reported as refunded so nothing is granted on it", () => {
    const parsed = parsePaymobEvent(PAYMOB_EVENT_TYPES.transaction, {
      ...payment,
      obj: { ...payment.obj, is_refunded: true },
    });
    expect(parsed).toMatchObject({
      transactionKind: "payment",
      reversed: true,
    });
  });

  it("gives a refunded-update its own event id so it is not dropped as a replay", () => {
    const base = { id: "9001", pending: false, success: true };
    expect(transactionEventId(base)).toBe("txn:9001:ok");
    expect(transactionEventId({ ...base, is_refunded: true })).toBe(
      "txn:9001:ok:refunded",
    );
    expect(transactionEventId({ ...base, is_voided: true })).toBe(
      "txn:9001:ok:voided",
    );
    expect(transactionEventId({ ...base, pending: true })).toBe(
      "txn:9001:pending",
    );
  });
});

describe("card details", () => {
  it("keeps only the last four digits of whatever Paymob masks", () => {
    expect(lastFour("2346")).toBe("2346");
    expect(lastFour("512345xxxxxx2346")).toBe("2346");
    expect(lastFour("**** **** **** 2346")).toBe("2346");
    expect(lastFour("12")).toBeNull();
    expect(lastFour(null)).toBeNull();
  });
});

describe("refund window", () => {
  it("is 90 days from the charge", () => {
    expect(REFUND_WINDOW_DAYS).toBe(90);
    expect(refundDeadline(PAID_AT).getTime()).toBe(
      PAID_AT.getTime() + 90 * DAY,
    );
    expect(
      isPastRefundWindow(PAID_AT, new Date(PAID_AT.getTime() + 89 * DAY)),
    ).toBe(false);
    expect(
      isPastRefundWindow(PAID_AT, new Date(PAID_AT.getTime() + 91 * DAY)),
    ).toBe(true);
  });
});

describe("charge check", () => {
  it("requires the exact amount and currency the checkout asked for", () => {
    const expected = { amountCents: 447_00, currency: "EGP" };
    expect(
      chargeMatches({ amountCents: 447_00, currency: "egp" }, expected),
    ).toBe(true);
    expect(
      chargeMatches({ amountCents: 4_47, currency: "EGP" }, expected),
    ).toBe(false);
    expect(
      chargeMatches({ amountCents: 447_00, currency: "USD" }, expected),
    ).toBe(false);
  });
});

describe("fees and CSV export", () => {
  it("estimates Paymob's local and foreign fees", () => {
    // 2.4% of EGP 149 = 3.576 → 3.58, + EGP 3.
    expect(estimatePaymobFeeCents(149_00)).toBe(358 + 300);
    expect(estimatePaymobFeeCents(149_00, "foreign")).toBe(387 + 300);
  });

  it("neutralises spreadsheet formulas and quotes separators", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("Acme, Inc.")).toBe('"Acme, Inc."');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(-5)).toBe("-5");
    expect(csvCell(null)).toBe("");
  });

  it("puts fee and net only on successful payments", () => {
    const base: LedgerCsvRow = {
      occurredAt: PAID_AT,
      providerTransactionId: "9001",
      kind: "payment",
      status: "succeeded",
      parentTransactionId: null,
      organizationId: "org-1",
      organizationName: "Acme",
      customerEmail: "owner@example.test",
      plan: "pro",
      interval: "month",
      seats: 3,
      amountCents: 447_00,
      currency: "EGP",
      refundedAmountCents: 0,
      cardBrand: "Visa",
      cardLast4: "2346",
    };
    const csv = ledgerToCsv([
      base,
      {
        ...base,
        providerTransactionId: "9002",
        kind: "refund",
        parentTransactionId: "9001",
        amountCents: 100_00,
      },
    ]);
    const [header, paymentLine, refundLine] = csv.trim().split("\r\n");
    expect(header).toContain("estimated_paymob_fee,estimated_net");
    // 2.4% of 447.00 = 10.728 → 10.73, + 3.00 = 13.73; net 433.27.
    expect(paymentLine).toContain(",447.00,0.00,13.73,433.27,Visa •••• 2346");
    expect(refundLine).toContain(",refund,succeeded,9001,");
    expect(refundLine).toContain(",100.00,0.00,,,");
  });
});

describe("receipt email", () => {
  const receipt = {
    kind: "payment" as const,
    providerTransactionId: "9001",
    parentTransactionId: null,
    occurredAt: PAID_AT,
    amountCents: 447_00,
    currency: "EGP",
    plan: "pro",
    interval: "month",
    seats: 3,
    cardBrand: "Visa",
    cardLast4: "2346",
    organizationName: "Acme <Corp>",
  };

  it("carries everything the merchant agreement asks for, in both languages", () => {
    const email = buildReceiptEmail(receipt);
    expect(email.subject).toContain("447");
    for (const needle of [
      "Gateling",
      "9001",
      "Visa •••• 2346",
      "Pro plan · 3 seat(s) · billed every 30 days",
      "info@gateling.com",
      "The amount includes VAT.",
      "Settings → Billing",
      "إيصال دفع",
    ]) {
      expect(email.text).toContain(needle);
    }
    // Dated in Cairo time.
    expect(email.text).toMatch(/1 September 2026/);
  });

  it("escapes user-supplied text in the HTML", () => {
    const { html } = buildReceiptEmail(receipt);
    expect(html).toContain("Acme &lt;Corp&gt;");
    expect(html).not.toContain("Acme <Corp>");
  });

  it("describes a refund against its original transaction, without a renewal note", () => {
    const email = buildReceiptEmail({
      ...receipt,
      kind: "refund",
      providerTransactionId: "9002",
      parentTransactionId: "9001",
      amountCents: 100_00,
    });
    expect(email.subject).toMatch(/^Refund issued/);
    expect(email.text).toContain("Original transaction: 9001");
    expect(email.text).toContain("original card");
    expect(email.text).not.toContain("renews automatically");
  });

  it("labels the card-update verification charge", () => {
    const email = buildReceiptEmail({
      ...receipt,
      plan: null,
      interval: null,
      seats: null,
      amountCents: 100,
    });
    expect(email.text).toContain("Card verification charge");
  });
});
