import { expect, test } from "@playwright/test";
import { MEMBER, signInAs } from "./helpers";

/**
 * The pricing page → billing details → Paymob test-mode checkout → /welcome
 * flow, end to end against Paymob's hosted page. Needs the stack running
 * with test keys and all four plan ids in `.env`.
 *
 * The buyer must be an owner of an org with no subscription. `MEMBER`
 * is; a completed run leaves a test-mode subscription behind at Paymob,
 * but nothing lands on the org locally unless the callback can reach the
 * app (it cannot on localhost), so it stays buyable for the next run. On
 * the preview deployment the callback does land and the plan flips.
 */
const CONFIGURED =
  process.env.BILLING_PROVIDER === "paymob" &&
  !!process.env.PAYMOB_PLAN_ID_PRO_MONTH;

/** Paymob's published test card; not a real card. */
const TEST_CARD = {
  number: "5123456789012346",
  holder: "Test Account",
  expiryMonth: "01",
  expiryYear: "39",
  cvv: "123",
};

test.describe("billing checkout (Paymob test mode)", () => {
  test.skip(!CONFIGURED, "Paymob test mode is not configured in .env");

  test("EGP prices, yearly toggle, billing details, hosted checkout, redirect to /welcome", async ({
    page,
  }) => {
    await signInAs(page, MEMBER);
    await page.goto("/pricing");

    // Prices are the EGP amounts from tiers.ts.
    const amounts = page.getByTestId("tier-price");
    await expect(amounts).toHaveCount(2);
    await expect(amounts.first()).toHaveText(/\d/);
    const monthly = await amounts.first().textContent();
    await expect(page.getByText("per seat / month").first()).toBeVisible();

    await page.getByRole("button", { name: "Yearly" }).click();
    await expect(page.getByText("per seat / year").first()).toBeVisible();
    await expect(amounts.first()).not.toHaveText(monthly ?? "");
    await page.getByRole("button", { name: "Monthly" }).click();
    await expect(amounts.first()).toHaveText(monthly ?? "");

    // Subscribe on the first (Pro) card asks for the billing contact first.
    await page.getByRole("button", { name: "Subscribe" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Billing details");
    await dialog.getByLabel("Full name").fill(MEMBER.name);
    await dialog.getByLabel("Phone number").fill("+201001234567");
    await dialog.getByRole("button", { name: "Continue to payment" }).click();

    // A top-level navigation to Paymob's unified checkout.
    await page.waitForURL(/accept\.paymob\.com\/unifiedcheckout/, {
      timeout: 45_000,
    });
    await expect(page.locator("body")).toContainText(/EGP|ج\.م/);

    const cardNumber = page.getByPlaceholder(/card number/i).first();
    await cardNumber.waitFor({ timeout: 45_000 });
    await cardNumber.fill(TEST_CARD.number);
    await page.getByPlaceholder(/name/i).first().fill(TEST_CARD.holder);
    await page.getByPlaceholder(/mm/i).first().fill(TEST_CARD.expiryMonth);
    await page.getByPlaceholder(/yy/i).first().fill(TEST_CARD.expiryYear);
    await page
      .getByPlaceholder(/cvv|cvc/i)
      .first()
      .fill(TEST_CARD.cvv);
    await page.getByRole("button", { name: /pay/i }).first().click();

    // Test mode may show a 3-D Secure simulator; it accepts any OTP.
    const otp = page.getByPlaceholder(/otp|password/i).first();
    if (await otp.isVisible({ timeout: 10_000 }).catch(() => false)) {
      await otp.fill("123456");
      await page
        .getByRole("button", { name: /submit|confirm|ok/i })
        .first()
        .click();
    }

    await page.waitForURL(/\/welcome/, { timeout: 90_000 });
    await expect(page.getByText("Welcome aboard!")).toBeVisible();
  });
});
