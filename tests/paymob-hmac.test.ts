import { describe, expect, it } from "vitest";

import {
  computeHmac,
  concatenateFields,
  TOKEN_HMAC_FIELDS,
  TRANSACTION_HMAC_FIELDS,
  verifyTokenHmac,
  verifyTransactionHmac,
} from "@/integrations/paymob/hmac";

const SECRET = "test-hmac-secret";

const transaction = {
  amount_cents: 44700,
  created_at: "2026-09-16T12:00:00.000000",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 123456,
  integration_id: 4567,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 987, merchant_order_id: "bc_abc" },
  owner: 42,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
};

const token = {
  id: 15978654,
  token: "3f22ce8a4e77125c70f0bc69830e34c36df469351e2fa6be76428be4",
  masked_pan: "xxxx-xxxx-xxxx-2346",
  merchant_id: 1053928,
  card_subtype: "MasterCard",
  created_at: "2026-08-24T13:28:31.015314",
  email: "buyer@example.test",
  order_id: "593881581",
  user_added: false,
};

describe("Paymob HMAC", () => {
  it("concatenates the documented fields in order, nested keys included", () => {
    expect(concatenateFields(transaction, TRANSACTION_HMAC_FIELDS)).toBe(
      "447002026-09-16T12:00:00.000000EGPfalsefalse1234564567truefalsefalsefalsetruefalse98742false2346MasterCardcardtrue",
    );
    expect(concatenateFields(token, TOKEN_HMAC_FIELDS)).toBe(
      "MasterCard2026-08-24T13:28:31.015314buyer@example.test15978654xxxx-xxxx-xxxx-23461053928593881581" +
        token.token,
    );
  });

  it("accepts a correctly signed transaction and token, case-insensitively", () => {
    const signature = computeHmac(
      concatenateFields(transaction, TRANSACTION_HMAC_FIELDS),
      SECRET,
    );
    expect(verifyTransactionHmac(transaction, signature, SECRET)).toBe(true);
    expect(
      verifyTransactionHmac(transaction, signature.toUpperCase(), SECRET),
    ).toBe(true);
    const tokenSignature = computeHmac(
      concatenateFields(token, TOKEN_HMAC_FIELDS),
      SECRET,
    );
    expect(verifyTokenHmac(token, tokenSignature, SECRET)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret and a missing signature", () => {
    const signature = computeHmac(
      concatenateFields(transaction, TRANSACTION_HMAC_FIELDS),
      SECRET,
    );
    expect(
      verifyTransactionHmac(
        { ...transaction, amount_cents: 1 },
        signature,
        SECRET,
      ),
    ).toBe(false);
    expect(
      verifyTransactionHmac(
        { ...transaction, success: false },
        signature,
        SECRET,
      ),
    ).toBe(false);
    expect(verifyTransactionHmac(transaction, signature, "other")).toBe(false);
    expect(verifyTransactionHmac(transaction, null, SECRET)).toBe(false);
    expect(verifyTransactionHmac(transaction, "", SECRET)).toBe(false);
    expect(verifyTransactionHmac(transaction, "deadbeef", SECRET)).toBe(false);
  });

  it("treats a missing field as an empty string rather than throwing", () => {
    const { order: _order, ...withoutOrder } = transaction;
    expect(() =>
      concatenateFields(withoutOrder, TRANSACTION_HMAC_FIELDS),
    ).not.toThrow();
    expect(
      concatenateFields(withoutOrder, TRANSACTION_HMAC_FIELDS),
    ).not.toContain("987");
  });
});
