import { expect, test } from "./fixtures";

import { joinRoom, signIn } from "./helpers";

/**
 * The lobby tells the truth about devices. With the fake camera/mic Chromium
 * provides, permission is granted and the fake mic plays a tone, so the
 * level meter moves and the status says sound is coming through. When the
 * browser refuses (`getUserMedia` rejects with NotAllowedError, the
 * Permissions API reports `denied`) the person sees *which* device is
 * blocked, a way to retry, and where in this browser to unblock it — not a
 * mic button that claims to be on.
 */
test.describe("media permissions", () => {
  let meetingUrl: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      permissions: ["camera", "microphone"],
    });
    const host = await context.newPage();
    await signIn(host);
    await host.goto("/dashboard");
    await host.getByRole("button", { name: /new meeting/i }).click();
    await host.waitForURL(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    meetingUrl = host.url();
    await context.close();
  });

  test("granted: the lobby hears the fake microphone", async ({ newPage }) => {
    const page = await newPage();
    await page.goto(meetingUrl);

    await expect(page.getByText(/picking up sound/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/showing video/i)).toBeVisible();
    const meter = page.getByRole("meter", { name: /microphone level/i });
    await expect(meter).toBeVisible();
    await expect
      .poll(async () => Number(await meter.getAttribute("value")), {
        timeout: 5_000,
      })
      .toBeGreaterThan(0);

    await page.getByRole("button", { name: /check audio & video/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Allowed", { exact: true })).toHaveCount(2);
    await expect(dialog.getByText(/picking up sound/i)).toBeVisible();
  });

  test("denied: each device says it is blocked, with a retry and a hint", async ({
    newPage,
  }) => {
    const page = await newPage();
    await page.addInitScript(() => {
      const denied = () => {
        const error = new DOMException("Permission denied", "NotAllowedError");
        return Promise.reject(error);
      };
      navigator.mediaDevices.getUserMedia = denied;
      const status = { state: "denied", onchange: null } as PermissionStatus;
      Object.defineProperty(status, "addEventListener", { value: () => {} });
      Object.defineProperty(status, "removeEventListener", { value: () => {} });
      navigator.permissions.query = () => Promise.resolve(status);
    });
    await page.goto(meetingUrl);

    await expect(
      page.getByText(/microphone access is blocked for this site/i),
    ).toBeVisible();
    await expect(
      page.getByText(/camera access is blocked for this site/i).first(),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /retry/i })).toHaveCount(2);
    await expect(page.getByText(/padlock/i)).toBeVisible();
    // The toggles report off, not a working mic.
    await expect(
      page.getByRole("button", { name: /^microphone$/i }),
    ).toHaveAttribute("aria-pressed", "false");

    await page.getByRole("button", { name: /check audio & video/i }).click();
    await expect(
      page.getByRole("dialog").getByText("Blocked", { exact: true }),
    ).toHaveCount(2);
  });

  test("in the room: device pickers and the audio check are reachable", async ({
    newPage,
  }) => {
    // The host: a guest would stop in the waiting room.
    const page = await newPage();
    await signIn(page);
    await page.goto(meetingUrl);
    await joinRoom(page, "Test Host");

    await page.getByRole("button", { name: /switch microphone/i }).click();
    await expect(page.getByRole("menuitemradio").first()).toBeVisible();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: /check audio & video/i }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/picking up sound/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});
