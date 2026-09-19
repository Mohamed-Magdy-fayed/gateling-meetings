import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

/**
 * The companion talks to a real model, so this runs only when a key is
 * configured (the header hides the button otherwise). One round trip:
 * ask for a meeting tomorrow with an invitee, expect a tool line with a
 * meeting link, and the meeting to appear under "Upcoming" on the
 * dashboard. Then an off-topic prompt is declined without a tool call.
 */
test("the companion schedules a meeting and hands back the link", async ({
  newPage,
}) => {
  test.setTimeout(180_000);
  const host = await newPage();
  await signIn(host);
  await host.goto("/dashboard");

  const open = host.getByRole("button", { name: /open the companion/i });
  test.skip(!(await open.isVisible().catch(() => false)), "no GEMINI_API_KEY");
  await open.click();

  const stamp = Date.now().toString(36);
  const box = host.getByRole("textbox", { name: /start a meeting/i });
  await box.fill(
    `Schedule a meeting called Companion ${stamp} tomorrow at 12 PM with a@example.test and give me the link`,
  );
  await box.press("Enter");

  const toolLine = host.locator('[data-tool="schedule_meeting"]');
  await expect(toolLine).toBeVisible({ timeout: 60_000 });
  const link = toolLine.getByRole("link");
  await expect(link).toHaveAttribute(
    "href",
    /\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/,
  );
  // The reply itself carries the link too, on its own line.
  await expect(
    host.getByText(/\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}/).first(),
  ).toBeVisible();

  // Off topic: no tool runs, a one-line decline arrives.
  await box.fill("Write me a poem about the sea");
  await box.press("Enter");
  await expect(host.getByText(/working on it/i)).toBeHidden({
    timeout: 60_000,
  });
  await expect(host.locator("[data-tool]")).toHaveCount(1);

  // The meeting is really there, scheduled, on the dashboard.
  await host.keyboard.press("Escape");
  await host.reload();
  await expect(
    host.locator("li", { hasText: `Companion ${stamp}` }).filter({
      hasText: /Scheduled/,
    }),
  ).toBeVisible();
});

/**
 * "Every Sunday" is not one meeting here, so the companion has to fan it
 * out: one series call, four separate meetings, four links, and no quiet
 * "I scheduled the first one".
 */
test("the companion turns a recurring request into a series of meetings", async ({
  newPage,
}) => {
  test.setTimeout(180_000);
  const host = await newPage();
  await signIn(host);
  await host.goto("/dashboard");

  const open = host.getByRole("button", { name: /open the companion/i });
  test.skip(!(await open.isVisible().catch(() => false)), "no GEMINI_API_KEY");
  await open.click();

  const stamp = Date.now().toString(36);
  const box = host.getByRole("textbox", { name: /start a meeting/i });
  await box.fill(
    `Schedule a meeting called Series ${stamp} every Sunday at 11 AM for the next 4 weeks`,
  );
  await box.press("Enter");

  const toolLine = host.locator('[data-tool="schedule_meeting_series"]');
  await expect(toolLine).toBeVisible({ timeout: 90_000 });
  await expect(toolLine.getByRole("link")).toHaveCount(4, {
    timeout: 60_000,
  });

  // Four real meetings on the dashboard, all scheduled.
  await host.keyboard.press("Escape");
  await host.reload();
  await expect(
    host.locator("li", { hasText: `Series ${stamp}` }).filter({
      hasText: /Scheduled/,
    }),
  ).toHaveCount(4);
});
