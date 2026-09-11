import { type Browser, expect, test } from "@playwright/test";

import { expectInRoom, joinRoom, signIn, submitPreJoin } from "./helpers";

/**
 * Host starts an instant meeting; a guest in a *separate* browser context
 * (no cookies, no account) asks to join, waits for the host, is admitted,
 * and both see two participants. Then the host controls: hand raise shows
 * on the other side, host mutes the guest, chat crosses the data channel,
 * lock refuses a newcomer, and "End for all" disconnects everyone.
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

  // Waiting room (on by default): the guest waits, the host admits.
  const guest = await newPage(browser);
  await guest.goto(meetingUrl);
  await submitPreJoin(guest, "Guest Gina");
  await expect(guest.getByText(/waiting for the host/i)).toBeVisible();
  await expect(host.getByText(/Guest Gina wants to join/)).toBeVisible({
    timeout: 10_000,
  });
  await host.getByRole("button", { name: /^participants$/i }).click();
  await expect(host.getByText(/1 person waiting/)).toBeVisible();
  await host
    .getByRole("button", { name: /^admit$/i })
    .first()
    .click();
  await expectInRoom(guest);

  await expect(host.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(guest.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });
  await expect(guest.getByText("Test Host", { exact: true })).toBeVisible();
  await expect(guest.getByText("Host", { exact: true })).toBeVisible();

  // Hand raise replicates through participant attributes.
  await guest.getByRole("button", { name: /raise hand/i }).click();
  await expect(host.getByLabel(/hand raised/i).first()).toBeVisible({
    timeout: 10_000,
  });

  // Host mutes the guest at the SFU; the guest's mic button flips to "Unmute".
  await host
    .getByRole("button", { name: /^actions$/i })
    .first()
    .click();
  await host.getByRole("menuitem", { name: /^mute$/i }).click();
  await expect(guest.getByRole("button", { name: /^unmute/i })).toBeVisible({
    timeout: 10_000,
  });

  // Chat over the data channel.
  await guest.getByRole("button", { name: /^chat$/i }).click();
  await guest.getByPlaceholder(/send a message/i).fill("hello from the guest");
  await guest.getByRole("button", { name: /^send$/i }).click();
  await host.getByRole("button", { name: /^chat$/i }).click();
  await expect(host.getByText("hello from the guest")).toBeVisible({
    timeout: 10_000,
  });

  // Lock: a newcomer is refused at the door.
  await host.getByRole("button", { name: /^settings$/i }).click();
  await host.getByRole("switch", { name: /lock meeting/i }).click();
  await expect(host.getByText(/^locked$/i)).toBeVisible();
  const late = await newPage(browser);
  await late.goto(meetingUrl);
  await submitPreJoin(late, "Late Larry");
  await expect(late.getByText(/host has locked/i)).toBeVisible();

  // Host ends for all → guest lands on the "ended" screen.
  await host.keyboard.press("Escape");
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
  await late.reload();
  await expect(late.getByText(/this meeting has ended/i)).toBeVisible();
});

async function newPage(browser: Browser) {
  const context = await browser.newContext({
    permissions: ["camera", "microphone"],
  });
  return context.newPage();
}
