import { expect, type Page } from "@playwright/test";

/** Local test host (see README). */
export const HOST = {
  email: "host@example.test",
  password: "Passw0rd!Local",
  name: "Test Host",
};

export async function signIn(page: Page) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: /email/i }).fill(HOST.email);
  // The sign-in form is two-step: email first, then password.
  const continueButton = page.getByRole("button", { name: /continue/i });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }
  await page.getByRole("textbox", { name: /password/i }).fill(HOST.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(dashboard|auth\/verify-email)/);
}

/** Fills the pre-join form and submits. */
export async function submitPreJoin(page: Page, displayName: string) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByPlaceholder(/how should we call you/i).fill(displayName);
  await page.getByRole("button", { name: /join now/i }).click();
}

/** Resolves once the room chrome (leave / end button) is on screen. */
export async function expectInRoom(page: Page) {
  await expect(
    page.getByRole("button", { name: /^(leave|end for all)$/i }).first(),
  ).toBeVisible({ timeout: 20_000 });
}

export async function joinRoom(page: Page, displayName: string) {
  await submitPreJoin(page, displayName);
  await expectInRoom(page);
}
