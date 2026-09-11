import { type Browser, expect, test } from "@playwright/test";

import { joinRoom, signIn } from "./helpers";

/**
 * Host starts an instant meeting; a guest in a *separate* browser context
 * (no cookies, no account) joins by link; both see two participants, the
 * guest sees the host badge, chat crosses the data channel, and "End for
 * all" disconnects the guest.
 */
test("host and guest meet in the same room", async ({ browser }) => {
  const host = await newPage(browser);
  await signIn(host);
  await host.goto("/dashboard");
  await host.getByRole("button", { name: /new meeting/i }).click();
  await host.waitForURL(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  const meetingUrl = host.url();

  await joinRoom(host, "Test Host");
  await expect(host.getByText(/1 participant$/)).toBeVisible();

  const guest = await newPage(browser);
  await guest.goto(meetingUrl);
  await joinRoom(guest, "Guest Gina");

  await expect(host.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(guest.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(guest.getByText("Test Host", { exact: true })).toBeVisible();
  await expect(guest.getByText("Host", { exact: true })).toBeVisible();

  // Chat over the data channel.
  await guest.getByRole("button", { name: /^chat$/i }).click();
  await guest.getByPlaceholder(/send a message/i).fill("hello from the guest");
  await guest.getByRole("button", { name: /^send$/i }).click();
  await host.getByRole("button", { name: /^chat$/i }).click();
  await expect(host.getByText("hello from the guest")).toBeVisible({
    timeout: 10_000,
  });

  // Host ends for all → guest lands on the "ended" screen.
  await host.getByRole("button", { name: /end for all/i }).click();
  await host
    .getByRole("alertdialog")
    .getByRole("button", { name: /end for all/i })
    .click();
  await expect(guest.getByText(/this meeting has ended/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect(host.getByText(/this meeting has ended/i)).toBeVisible({
    timeout: 15_000,
  });

  // The link is dead now: a fresh visitor sees the ended screen immediately.
  const late = await newPage(browser);
  await late.goto(meetingUrl);
  await expect(late.getByText(/this meeting has ended/i)).toBeVisible();
});

async function newPage(browser: Browser) {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  return context.newPage();
}
