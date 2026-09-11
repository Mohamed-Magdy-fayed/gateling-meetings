import { test } from "./fixtures";

import { expectInRoom, signIn, submitPreJoin } from "./helpers";

/**
 * Not an assertion suite — captures the room at the breakpoints and locale
 * that matter so a person can eyeball them (`test-results/visual/`). Kept
 * separate from meeting.spec.ts so the functional test stays fast.
 */
test("room screenshots: RTL desktop + mobile", async ({ newPage }) => {
  const host = await newPage();
  await host.setViewportSize({ width: 1280, height: 720 });
  await signIn(host);
  await host
    .context()
    .addCookies([
      { name: "NEXT_LOCALE", value: "ar", url: "http://localhost:3000" },
    ]);
  await host.goto("/dashboard");
  await host.screenshot({ path: "test-results/visual/dashboard-ar.png" });
  await host.getByRole("button", { name: /اجتماع جديد/ }).click();
  await host.waitForURL(/\/m\//);
  const url = host.url();
  await host.screenshot({ path: "test-results/visual/prejoin-ar.png" });
  await host.getByPlaceholder(/بماذا نناديك/).fill("المضيف");
  await host.getByRole("button", { name: /انضم الآن/ }).click();
  await host
    .getByRole("button", { name: /إنهاء للجميع/ })
    .waitFor({ timeout: 20_000 });

  const mobile = await newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(url);
  await mobile.screenshot({ path: "test-results/visual/prejoin-mobile.png" });
  await submitPreJoin(mobile, "Guest");
  await mobile.screenshot({ path: "test-results/visual/waiting-mobile.png" });
  // Host sees the queue in the participants panel and admits.
  await host.getByRole("button", { name: /المشاركون/ }).click();
  await host
    .getByRole("button", { name: /^قبول$/ })
    .first()
    .waitFor();
  await host.screenshot({ path: "test-results/visual/host-queue-ar.png" });
  await host
    .getByRole("button", { name: /^قبول$/ })
    .first()
    .click();
  await host.getByRole("button", { name: /المشاركون/ }).click();
  await expectInRoom(mobile);
  await mobile.waitForTimeout(1500);
  await host.waitForTimeout(500);
  await host.screenshot({ path: "test-results/visual/room-ar-desktop.png" });
  await mobile.screenshot({ path: "test-results/visual/room-mobile.png" });
  await mobile.getByRole("button", { name: /^chat$/i }).click();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: "test-results/visual/room-mobile-chat.png" });
});
