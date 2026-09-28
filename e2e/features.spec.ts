import { expect, test } from "./fixtures";
import { HOST, joinRoom, MEMBER, pipText, signInAs } from "./helpers";

const PIP_ANNOTATE = /annotate from the floating window/i;

/**
 * Settings → Features: the platform admin flips a meeting switch at
 * runtime (no redeploy) and the next room follows it. The switch is put
 * back afterwards — it is platform-wide state other specs depend on.
 */
test("admin toggles floating-window annotate for the next room", async ({
  newPage,
}) => {
  const admin = await newPage();
  await signInAs(admin, HOST);
  await admin.goto("/settings/features");
  const toggle = admin.getByRole("switch", { name: PIP_ANNOTATE });
  const wasOn = (await toggle.getAttribute("aria-checked")) === "true";

  try {
    for (const want of [!wasOn, wasOn]) {
      if ((await toggle.getAttribute("aria-checked")) !== String(want)) {
        await toggle.click();
      }
      await expect(toggle).toHaveAttribute("aria-checked", String(want));
      // Saved: a reload shows the same value.
      await admin.reload();
      await expect(toggle).toHaveAttribute("aria-checked", String(want));

      // A fresh room picks it up.
      await admin.goto("/dashboard");
      await admin.getByRole("button", { name: /new meeting/i }).click();
      await admin.waitForURL(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
      await joinRoom(admin, "Test Host");
      await admin.getByRole("button", { name: /share screen/i }).click();
      await expect
        .poll(() => pipText(admin), { timeout: 15_000 })
        .toMatch(/Pause/);
      const text = await pipText(admin);
      expect(/\bAnnotate\b/.test(text)).toBe(want);
      await admin
        .getByRole("button", { name: /stop sharing/i })
        .first()
        .click();
      await admin.goto("/settings/features");
    }
  } finally {
    await admin.goto("/settings/features");
    if ((await toggle.getAttribute("aria-checked")) !== String(wasOn)) {
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-checked", String(wasOn));
    }
  }
});

test("only the platform admin sees Settings → Features", async ({
  newPage,
}) => {
  const member = await newPage();
  await signInAs(member, MEMBER);
  await member.goto("/settings/account");
  await expect(member.getByRole("link", { name: /^features$/i })).toHaveCount(
    0,
  );
  const response = await member.goto("/settings/features");
  expect(response?.status()).toBe(404);
});
