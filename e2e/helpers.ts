import { expect, type Page } from "@playwright/test";

export type Account = { email: string; password: string; name: string };

/** Local test host (see README). Listed in `ADMIN_EMAILS`, so it is unlimited. */
export const HOST: Account = {
  email: "host@example.test",
  password: "Passw0rd!Local",
  name: "Test Host",
};

/**
 * A second, *non-admin* account for anything that exercises plan limits —
 * the host above bypasses every cap. Must NOT be in `ADMIN_EMAILS`.
 */
export const MEMBER: Account = {
  email: "member@example.test",
  password: "Passw0rd!Local",
  name: "Test Member",
};

export async function signInAs(page: Page, account: Account) {
  await page.goto("/auth/sign-in");
  await page.getByRole("textbox", { name: /email/i }).fill(account.email);
  // The sign-in form is two-step: email first, then password.
  const continueButton = page.getByRole("button", { name: /continue/i });
  if (await continueButton.isVisible().catch(() => false)) {
    await continueButton.click();
  }
  await page.getByRole("textbox", { name: /password/i }).fill(account.password);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL(/\/(dashboard|auth\/verify-email)/);
}

export function signIn(page: Page) {
  return signInAs(page, HOST);
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

/** Runs `fn` against the Document Picture-in-Picture window's document. */
export function pipText(page: Page) {
  return page.evaluate(
    () =>
      window.documentPictureInPicture?.window?.document.body.innerText ?? "",
  );
}

/** Clicks the first button in the floating window whose aria-label matches. */
export async function clickInPip(page: Page, label: RegExp) {
  const clicked = await page.evaluate(
    ({ source, flags }) => {
      const pattern = new RegExp(source, flags);
      const doc = window.documentPictureInPicture?.window?.document;
      const button = [...(doc?.querySelectorAll("button") ?? [])].find(
        (candidate) =>
          pattern.test(
            candidate.getAttribute("aria-label") ?? candidate.innerText,
          ) && !candidate.disabled,
      );
      button?.click();
      return button != null;
    },
    { source: label.source, flags: label.flags },
  );
  expect(clicked, `no enabled floating-window button matching ${label}`).toBe(
    true,
  );
}

/** Has the guest at `meetingUrl` join, and the host admit them from the queue. */
export async function joinAsGuest(
  guest: Page,
  host: Page,
  meetingUrl: string,
  name: string,
) {
  await guest.goto(meetingUrl);
  await submitPreJoin(guest, name);
  await expect(host.getByText(new RegExp(`${name} wants to join`))).toBeVisible(
    { timeout: 10_000 },
  );
  await host
    .getByRole("button", { name: /^admit$/i })
    .first()
    .click();
  await expectInRoom(guest);
}

/**
 * Makes one tRPC procedure fail with `status`. tRPC batches calls into
 * `/api/trpc/a,b?batch=1`, so the match is on the path segment.
 */
export async function routeTrpcError(
  page: Page,
  procedure: string,
  status = 500,
) {
  await page.route(
    (url) =>
      url.pathname.startsWith("/api/trpc/") &&
      url.pathname.split("/").at(-1)?.split(",").includes(procedure) === true,
    (route) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify([
          {
            error: {
              json: {
                message: "Injected failure",
                code: -32603,
                data: { code: "INTERNAL_SERVER_ERROR", httpStatus: status },
              },
            },
          },
        ]),
      }),
  );
}

/** Dispatches a keydown on the floating window's document. */
export function keyInPip(
  page: Page,
  key: string,
  modifiers: { ctrlKey?: boolean } = {},
) {
  return page.evaluate(
    ({ key, modifiers }) => {
      const doc = window.documentPictureInPicture?.window?.document;
      doc?.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, ...modifiers }),
      );
    },
    { key, modifiers },
  );
}

/** `aria-pressed` of the floating window's button whose label matches. */
export function pipPressed(page: Page, label: RegExp) {
  return page.evaluate(
    ({ source, flags }) => {
      const pattern = new RegExp(source, flags);
      const doc = window.documentPictureInPicture?.window?.document;
      const button = [...(doc?.querySelectorAll("button") ?? [])].find(
        (candidate) => pattern.test(candidate.getAttribute("aria-label") ?? ""),
      );
      return button?.getAttribute("aria-pressed") ?? null;
    },
    { source: label.source, flags: label.flags },
  );
}

/** Pretends the tab went to the background (`visibilityState` + event). */
export function setDocumentHidden(page: Page, hidden: boolean) {
  return page.evaluate((isHidden) => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => (isHidden ? "hidden" : "visible"),
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

/**
 * Drags a mouse pointer across the floating window's drawing layer, from
 * (x0, y) to (x1, y) in fractions of its box. Dispatched on the floating
 * window's document, since Playwright cannot move the real mouse there.
 */
export async function pointerDragInPip(
  page: Page,
  from: [number, number],
  to: [number, number],
  steps = 10,
) {
  const drew = await page.evaluate(
    ({ from, to, steps }) => {
      const win = window.documentPictureInPicture?.window;
      const layer = win?.document.querySelector<HTMLElement>(
        "[data-annotation-input]",
      );
      if (!win || !layer) return false;
      const rect = layer.getBoundingClientRect();
      const at = (fx: number, fy: number) => ({
        clientX: rect.left + rect.width * fx,
        clientY: rect.top + rect.height * fy,
      });
      const fire = (type: string, fx: number, fy: number, buttons: number) =>
        layer.dispatchEvent(
          new (win as typeof window).PointerEvent(type, {
            bubbles: true,
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            button: type === "pointermove" ? -1 : 0,
            buttons,
            ...at(fx, fy),
          }),
        );
      fire("pointerdown", from[0], from[1], 1);
      for (let i = 1; i <= steps; i++) {
        const f = i / steps;
        fire(
          "pointermove",
          from[0] + (to[0] - from[0]) * f,
          from[1] + (to[1] - from[1]) * f,
          1,
        );
      }
      fire("pointerup", to[0], to[1], 0);
      return true;
    },
    { from, to, steps },
  );
  expect(drew, "no drawing layer in the floating window").toBe(true);
}
