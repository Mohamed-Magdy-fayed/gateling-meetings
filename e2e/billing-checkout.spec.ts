import { expect, test } from "@playwright/test";
import { MEMBER, signInAs } from "./helpers";

/**
 * The pricing page → Paddle sandbox checkout → /welcome flow, end to end
 * against the real sandbox. Needs the local stack (README) plus a sandbox
 * `.env` with all four price ids and the client token, and the sandbox
 * account's default payment link set to http://localhost:3000/pricing.
 *
 * The buyer must be an owner of an org with no subscription. `MEMBER`
 * is; a completed run leaves a sandbox subscription behind, but nothing
 * lands on the org locally (no webhook can reach localhost), so it stays
 * buyable for the next run.
 */
const CONFIGURED =
  !!process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN &&
  !!process.env.PADDLE_PRICE_ID_PRO_MONTH;

/** Paddle's published sandbox card; not a real card. */
const TEST_CARD = {
  number: "4242 4242 4242 4242",
  expiry: "12 / 30",
  cvv: "100",
};

test.describe("billing checkout (Paddle sandbox)", () => {
  test.skip(!CONFIGURED, "Paddle sandbox is not configured in .env");

  test("localized prices, yearly toggle, one-page overlay, redirect to /welcome", async ({
    page,
  }) => {
    await signInAs(page, MEMBER);
    await page.goto("/pricing");

    // Prices come from Paddle.PricePreview — some currency-looking string.
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

    // Subscribe on the first (Pro) card opens the overlay for the price shown.
    await page.getByRole("button", { name: "Subscribe" }).first().click();
    const checkout = page.frameLocator('iframe[name="paddle_frame"]');
    const cardNumber = checkout.getByTestId("cardNumberInput");
    await cardNumber.waitFor({ timeout: 45_000 });

    // One-page: customer, country and card are on the same screen; the
    // signed-in buyer's email is prefilled and the total matches the card.
    await expect(checkout.locator("body")).toContainText(MEMBER.email);
    await expect(checkout.locator("body")).toContainText(monthly ?? "");
    await expect(checkout.getByTestId("countriesSelect")).not.toHaveValue("");

    await checkout.getByTestId("cardholderNameInput").fill(MEMBER.name);
    await cardNumber.fill(TEST_CARD.number);
    await checkout.getByTestId("expiryDateField").fill(TEST_CARD.expiry);
    await checkout
      .getByTestId("cardVerificationValueInput")
      .fill(TEST_CARD.cvv);
    await checkout.getByTestId("cardPaymentFormSubmitButton").click();

    await page.waitForURL(/\/welcome$/, { timeout: 90_000 });
    await expect(page.getByText("Welcome aboard!")).toBeVisible();
  });
});
