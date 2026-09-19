import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { signIn } from "./helpers";

const MEETING_URL = /\/m\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/;

/** Leaves no live meeting behind so the counts below are exact. */
async function endEverything(host: Page) {
  await host.goto("/dashboard");
  const endAll = host.getByRole("button", { name: /^end all/i });
  if (await endAll.isVisible().catch(() => false)) {
    await endAll.click();
    await host
      .getByRole("alertdialog")
      .getByRole("button", { name: /^end all/i })
      .click();
    // Each end deletes a LiveKit room; a backlog can take a while.
    await expect(host.getByText(/meetings? ended\./i)).toBeVisible({
      timeout: 60_000,
    });
  }
  const endOne = host.getByRole("button", { name: /end meeting/i });
  if (await endOne.isVisible().catch(() => false)) {
    await endOne.click();
    await host
      .getByRole("alertdialog")
      .getByRole("button", { name: /end meeting/i })
      .click();
    await expect(host.getByText(/meeting ended\./i)).toBeVisible();
  }
  await expect(endOne).toHaveCount(0);
}

/** Starts an instant meeting (live at once) and returns its code. */
async function startInstant(host: Page) {
  await host.goto("/dashboard");
  await host.getByRole("button", { name: /new meeting/i }).click();
  await host.waitForURL(MEETING_URL);
  return host.url().split("/m/")[1];
}

/**
 * Two instant meetings are started and left in the lobby (creating one puts
 * it live at once). The lobby shows the link with Copy; back on the
 * dashboard both sit under "In progress" with an End button each and an
 * "End all" for the pair. Ending one moves it to Ended and the pair button
 * goes away.
 */
test("live meetings can be ended from the dashboard card", async ({
  newPage,
}) => {
  const host = await newPage();
  await signIn(host);
  await endEverything(host);

  const first = await startInstant(host);
  const second = await startInstant(host);

  // --- the lobby carries the link and a Copy button
  await expect(host.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(host.getByText(`/m/${second}`)).toBeVisible();
  await expect(host.getByRole("button", { name: /copy link/i })).toBeVisible();

  // --- dashboard: both live, End on each, End all for the pair
  await host.goto("/dashboard");
  const cards = host.locator("li", { hasText: /Live/ });
  await expect(cards.filter({ hasText: first })).toBeVisible();
  await expect(cards.filter({ hasText: second })).toBeVisible();
  await expect(
    host.getByRole("button", { name: /end all \(2\)/i }),
  ).toBeVisible();

  // End one: confirm dialog, then it lands under Ended.
  await cards
    .filter({ hasText: first })
    .getByRole("button", { name: /end meeting/i })
    .click();
  await host
    .getByRole("alertdialog")
    .getByRole("button", { name: /end meeting/i })
    .click();
  await expect(host.getByText(/meeting ended\./i)).toBeVisible();
  await expect(
    host.locator("li", { hasText: first }).filter({ hasText: /Ended/ }),
  ).toBeVisible();
  await expect(host.getByRole("button", { name: /^end all/i })).toHaveCount(0);
  await expect(
    cards.filter({ hasText: second }).getByRole("button", {
      name: /end meeting/i,
    }),
  ).toBeVisible();
});

test("End all ends every live meeting at once", async ({ newPage }) => {
  const host = await newPage();
  await signIn(host);
  await endEverything(host);

  const codes = [await startInstant(host), await startInstant(host)];

  await host.goto("/dashboard");
  await host.getByRole("button", { name: /end all \(2\)/i }).click();
  await host
    .getByRole("alertdialog")
    .getByRole("button", { name: /end all \(2\)/i })
    .click();
  await expect(host.getByText(/2 meetings ended\./i)).toBeVisible();
  for (const code of codes) {
    await expect(
      host.locator("li", { hasText: code }).filter({ hasText: /Ended/ }),
    ).toBeVisible();
  }
  await expect(host.getByRole("button", { name: /end meeting/i })).toHaveCount(
    0,
  );
});
