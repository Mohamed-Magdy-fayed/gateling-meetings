import { expect, test } from "./fixtures";

import { joinRoom, signIn, submitPreJoin } from "./helpers";

/**
 * The sharer keeps seeing people: their own screen is not pinned on their
 * stage, a "you are sharing" banner offers the floating window and a stop
 * button, and the guest still gets the share pinned as before.
 *
 * Chromium picks the capture source by itself here (see
 * `--auto-select-desktop-capture-source` in playwright.config.ts).
 */
test("sharer keeps the other cameras in view", async ({ newPage }) => {
  const host = await newPage();
  await signIn(host);
  await host.goto("/dashboard");
  await host.getByRole("button", { name: /new meeting/i }).click();
  await host.waitForURL(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  const meetingUrl = host.url();
  await joinRoom(host, "Test Host");

  const guest = await newPage();
  await guest.goto(meetingUrl);
  await submitPreJoin(guest, "Guest Gina");
  await expect(host.getByText(/Guest Gina wants to join/)).toBeVisible({
    timeout: 10_000,
  });
  await host
    .getByRole("button", { name: /^admit$/i })
    .first()
    .click();
  await expect(host.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });

  await host.getByRole("button", { name: /share screen/i }).click();

  // Sharer: banner with pop-out + stop, the guest's tile still on stage,
  // and nothing pinned (the share is kept off the sharer's own stage).
  await expect(host.getByText(/you are sharing your screen/i)).toBeVisible({
    timeout: 15_000,
  });
  // The floating window opens by itself when the share starts (the click
  // still counts as the gesture), so the button offers to close it; closing
  // flips it back to the offer to pop out.
  const closeFloating = host.getByRole("button", {
    name: /close floating window/i,
  });
  await expect(closeFloating).toBeVisible();
  await closeFloating.click();
  await expect(
    host.getByRole("button", { name: /pop out people/i }),
  ).toBeVisible();
  await expect(host.getByText("Guest Gina", { exact: true })).toBeVisible();
  await expect(host.locator(".lk-focus-layout")).toHaveCount(0);

  // Guest: the share is pinned into the focus layout.
  await expect(guest.locator(".lk-focus-layout")).toBeVisible({
    timeout: 15_000,
  });

  await host
    .getByRole("button", { name: /stop sharing/i })
    .first()
    .click();
  await expect(host.getByText(/you are sharing your screen/i)).toBeHidden();
  await expect(guest.locator(".lk-focus-layout")).toHaveCount(0, {
    timeout: 15_000,
  });
});
