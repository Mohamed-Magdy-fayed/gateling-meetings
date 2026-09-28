import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  clickInPip,
  expectInRoom,
  joinAsGuest,
  joinRoom,
  keyInPip,
  pipPressed,
  pipText,
  routeTrpcError,
  setDocumentHidden,
  signIn,
  submitPreJoin,
} from "./helpers";

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
  // The floating window carries the sharer's own camera (self-view) next to
  // the guest's, plus its own pause control.
  await expect
    .poll(() =>
      host.evaluate(
        () => window.documentPictureInPicture?.window?.document.body.innerText,
      ),
    )
    .toMatch(/Guest Gina[\s\S]*You[\s\S]*Pause/);
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

  // Pause keeps the share published (still pinned for the guest) but tells
  // them it is paused; resume brings it back without a new picker.
  await host.getByRole("button", { name: /^pause$/i }).click();
  await expect(host.getByText(/your screen share is paused/i)).toBeVisible();
  await expect(
    guest.getByText(/Test Host paused their screen share/i),
  ).toBeVisible({ timeout: 15_000 });
  await expect(guest.locator(".lk-focus-layout")).toBeVisible();
  await host.getByRole("button", { name: /^resume$/i }).click();
  await expect(host.getByText(/you are sharing your screen/i)).toBeVisible();
  await expect(
    guest.getByText(/Test Host paused their screen share/i),
  ).toBeHidden({ timeout: 15_000 });

  await host
    .getByRole("button", { name: /stop sharing/i })
    .first()
    .click();
  await expect(host.getByText(/you are sharing your screen/i)).toBeHidden();
  await expect(guest.locator(".lk-focus-layout")).toHaveCount(0, {
    timeout: 15_000,
  });
});

/** Host in a new meeting, one admitted guest, the host sharing their screen. */
async function hostSharingWithGuest(newPage: () => Promise<Page>) {
  const host = await newPage();
  await signIn(host);
  await host.goto("/dashboard");
  await host.getByRole("button", { name: /new meeting/i }).click();
  await host.waitForURL(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  const meetingUrl = host.url();
  await joinRoom(host, "Test Host");

  const guest = await newPage();
  await joinAsGuest(guest, host, meetingUrl, "Guest Gina");
  await expect(host.getByText(/2 participants/)).toBeVisible({
    timeout: 15_000,
  });

  await host.getByRole("button", { name: /share screen/i }).click();
  await expect(host.getByText(/you are sharing your screen/i)).toBeVisible({
    timeout: 15_000,
  });
  await expect.poll(() => pipText(host)).toMatch(/Guest Gina/);
  await expect(guest.locator(".lk-focus-layout")).toBeVisible({
    timeout: 15_000,
  });
  return { host, guest };
}

/** The floating window's button labels, for label assertions. */
function pipLabels(page: Page) {
  return page.evaluate(() =>
    [
      ...(window.documentPictureInPicture?.window?.document.querySelectorAll(
        "button",
      ) ?? []),
    ].map((button) => button.getAttribute("aria-label") ?? button.innerText),
  );
}

test("host moderates a guest from the floating window", async ({ newPage }) => {
  const { host, guest } = await hostSharingWithGuest(newPage);

  // Mute: the guest is told, and the host's button turns into an ask.
  await clickInPip(host, /^Mute .*Guest Gina/);
  await expect(guest.getByText("The host muted you.")).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(() => pipLabels(host))
    .toContainEqual(expect.stringMatching(/Ask .*Guest Gina.* to unmute/));

  // Ask to unmute: the guest accepts, the host sees the mic back on.
  await clickInPip(host, /Ask .*Guest Gina.* to unmute/);
  await expect(guest.getByText(/the host asked you to unmute/i)).toBeVisible({
    timeout: 15_000,
  });
  await guest.getByRole("button", { name: /^unmute$/i }).click();
  await expect
    .poll(() => pipLabels(host), { timeout: 15_000 })
    .toContainEqual(expect.stringMatching(/^Mute .*Guest Gina/));

  // Camera off.
  await clickInPip(host, /Turn off .*Guest Gina.*camera/);
  await expect(guest.getByText("The host turned off your camera.")).toBeVisible(
    { timeout: 15_000 },
  );

  // Lower a raised hand.
  await guest.getByRole("button", { name: /raise hand/i }).click();
  await expect
    .poll(() => pipLabels(host), { timeout: 15_000 })
    .toContainEqual(expect.stringMatching(/Lower .*Guest Gina.*hand/));
  await clickInPip(host, /Lower .*Guest Gina.*hand/);
  await expect(guest.getByText("The host lowered your hand.")).toBeVisible({
    timeout: 15_000,
  });

  // Mute everyone (the guest's mic is on again since they accepted the ask).
  await clickInPip(host, /^Mute everyone$/);
  await expect(guest.getByText("The host muted everyone.")).toBeVisible({
    timeout: 15_000,
  });

  // Remove: Esc cancels and returns focus to Remove; Confirm removes.
  await clickInPip(host, /^Remove .*Guest Gina/);
  expect(
    await host.evaluate(() => {
      const doc = window.documentPictureInPicture?.window?.document;
      const active = doc?.activeElement as HTMLElement | null;
      const label = active?.innerText;
      active?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      return label;
    }),
  ).toBe("Cancel");
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          window.documentPictureInPicture?.window?.document.activeElement?.getAttribute(
            "aria-label",
          ) ?? "",
      ),
    )
    .toMatch(/^Remove .*Guest Gina/);
  await clickInPip(host, /^Remove .*Guest Gina/);
  await clickInPip(host, /^Remove$/);
  await expect(
    guest.getByText(/you were removed from the meeting/i),
  ).toBeVisible({ timeout: 15_000 });
});

test("a failed host action shows inline in the floating window", async ({
  newPage,
}) => {
  const { host } = await hostSharingWithGuest(newPage);
  await routeTrpcError(host, "host.muteMicrophone");
  await clickInPip(host, /^Mute .*Guest Gina/);
  await expect.poll(() => pipText(host)).toMatch(/didn.t work[\s\S]*Retry/);
});

/**
 * A second guest knocks while the host shares. The e2e share is the entire
 * (virtual) screen, so the strip shows only the count — the floating window
 * is captured too — and names appear after "Review".
 */
async function knockWhileSharing(
  newPage: () => Promise<Page>,
  host: Page,
  guest: Page,
) {
  const knocker = await newPage();
  await knocker.goto(guest.url());
  await submitPreJoin(knocker, "Knocker Kim");
  await expect
    .poll(() => pipText(host), { timeout: 15_000 })
    .toMatch(/1 person waiting/);
  // Visible strip: count only. Screen readers still hear who knocked.
  const strip = () =>
    host.evaluate(
      () =>
        window.documentPictureInPicture?.window?.document.querySelector(
          "section[aria-label]",
        )?.textContent ?? "",
    );
  expect(await strip()).not.toMatch(/Knocker Kim/);
  const live = await host.evaluate(
    () =>
      window.documentPictureInPicture?.window?.document.querySelector(
        "[aria-live=polite]",
      )?.textContent ?? "",
  );
  expect(live).toBe("Knocker Kim wants to join");
  await clickInPip(host, /^review$/i);
  await expect.poll(() => pipText(host)).toMatch(/Knocker Kim/);
  return knocker;
}

test("host admits a knock from the floating window", async ({ newPage }) => {
  const { host, guest } = await hostSharingWithGuest(newPage);
  const knocker = await knockWhileSharing(newPage, host, guest);

  await clickInPip(host, /^admit$/i);
  await expect.poll(() => pipText(host)).toMatch(/Knocker Kim admitted/);
  await expectInRoom(knocker);
  // The notice collapses after a moment (the live region keeps its text).
  await expect
    .poll(() =>
      host.evaluate(
        () =>
          window.documentPictureInPicture?.window?.document.querySelector(
            "[role=status]",
          )?.textContent ?? "",
      ),
    )
    .not.toMatch(/Knocker Kim admitted/);
  // The opener's toast for that knock is gone too.
  await expect(host.getByText(/Knocker Kim wants to join/)).toHaveCount(0);
});

test("a failed admit shows inline in the strip and can be retried", async ({
  newPage,
}) => {
  const { host, guest } = await hostSharingWithGuest(newPage);
  await knockWhileSharing(newPage, host, guest);
  await routeTrpcError(host, "host.admit");
  await clickInPip(host, /^admit$/i);
  await expect.poll(() => pipText(host)).toMatch(/didn.t work/);
  // The row is back and its buttons are enabled for a retry.
  await clickInPip(host, /^admit$/i);
});

test("the sharer toggles their own mic from the floating window", async ({
  newPage,
}) => {
  const { host } = await hostSharingWithGuest(newPage);
  const micButton = /^(mute|unmute) \(m\)$/i;
  const before = await pipPressed(host, micButton);
  expect(before).not.toBeNull();

  await clickInPip(host, micButton);
  await expect.poll(() => pipPressed(host, micButton)).not.toBe(before);

  // M in the floating window flips it back; Ctrl+M does nothing.
  await keyInPip(host, "m", { ctrlKey: true });
  await expect.poll(() => pipPressed(host, micButton)).not.toBe(before);
  await keyInPip(host, "m");
  await expect.poll(() => pipPressed(host, micButton)).toBe(before);
});

test("a knock badges the hidden meeting tab's title", async ({ newPage }) => {
  const { host, guest } = await hostSharingWithGuest(newPage);
  await setDocumentHidden(host, true);
  await knockWhileSharing(newPage, host, guest);
  await expect.poll(() => host.title()).toMatch(/^⁨\(1\)⁩ /);
  await setDocumentHidden(host, false);
  await expect.poll(() => host.title()).not.toMatch(/\(1\)/);
});

/** Drags a pen stroke across the middle of the pinned share. */
async function drawStroke(page: Page, atY: number) {
  const share = page.locator(".lk-focus-layout-stage");
  // The ink layer appears once the share's frame size is known.
  await expect(share.locator("svg[data-annotation-ink]")).toBeVisible({
    timeout: 15_000,
  });
  const box = await share.boundingBox();
  if (!box) throw new Error("no share on stage");
  const y = box.y + box.height * atY;
  await page.mouse.move(box.x + box.width * 0.3, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(box.x + box.width * (0.3 + i * 0.03), y + i * 3);
  }
  await page.mouse.up();
}

/** Visible strokes on the pinned share (each is a halo path plus an ink path). */
async function strokeCount(page: Page) {
  const paths = await page
    .locator(".lk-focus-layout-stage svg[data-annotation-ink] path")
    .count();
  return paths / 2;
}

test("guest annotates the share and the host sees it", async ({ newPage }) => {
  const { host, guest } = await hostSharingWithGuest(newPage);

  await guest
    .getByRole("button", { name: /draw on the shared screen/i })
    .click();
  await drawStroke(guest, 0.4);
  await drawStroke(guest, 0.6);
  await expect.poll(() => strokeCount(guest)).toBe(2);

  // The sharer is told, then turns on their Annotate view to see the ink.
  await expect(host.getByText("1 person annotating").first()).toBeVisible({
    timeout: 15_000,
  });
  await host.getByRole("button", { name: /^annotate$/i }).click();
  await expect.poll(() => strokeCount(host), { timeout: 15_000 }).toBe(2);

  // Undo removes only the latest stroke, everywhere.
  await guest.getByRole("button", { name: /^undo$/i }).click();
  await expect.poll(() => strokeCount(host), { timeout: 15_000 }).toBe(1);

  // Clicking the active pen again leaves the tool.
  await guest.getByRole("button", { name: /^pen$/i }).click();
  await expect(
    guest.getByRole("button", { name: /draw on the shared screen/i }),
  ).toBeVisible();

  // The host clears everyone's ink (two-step, from the banner).
  await host
    .getByRole("button", { name: /clear everyone.s ink/i })
    .first()
    .click();
  await host.getByRole("button", { name: /^clear$/i }).click();
  await expect.poll(() => strokeCount(guest), { timeout: 15_000 }).toBe(0);
});

test("turning annotations off hides the guest's tools and ink", async ({
  newPage,
}) => {
  const { host, guest } = await hostSharingWithGuest(newPage);
  await guest
    .getByRole("button", { name: /draw on the shared screen/i })
    .click();
  await drawStroke(guest, 0.5);
  await expect.poll(() => strokeCount(guest)).toBe(1);

  await host.getByRole("button", { name: /^settings$/i }).click();
  await host
    .getByRole("switch", { name: /participants can draw on shared screens/i })
    .click();

  await expect(guest.getByText("The host turned off annotations.")).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(
    guest.getByRole("button", { name: /draw on the shared screen/i }),
  ).toHaveCount(0);
  await expect.poll(() => strokeCount(guest)).toBe(0);
});
