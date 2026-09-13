import postgres from "postgres";
import { expect, test } from "./fixtures";

import { joinRoom, MEMBER, signInAs, submitPreJoin } from "./helpers";

/**
 * The free tier's caps, seen by a *non-admin* host (the admin test host is
 * unlimited): the scheduled-meeting cap on the form, breakouts hidden
 * behind the plan, and the participant cap at the join door. The
 * participant test opens six browser contexts, so it is marked slow.
 */
test.describe("free-tier limits", () => {
  test.beforeEach(async () => {
    // Start every run from a clean free org with no upcoming meetings.
    const sql = postgres(process.env.DATABASE_URL as string);
    await sql`
      update organizations o set "plan" = 'free', "planSource" = 'free',
        "planExpiresAt" = null, "seatLimit" = 1
      from users u where u.id = o."personalOwnerId" and u.email = ${MEMBER.email}`;
    await sql`
      update meetings m set "deletedAt" = now()
      from users u where u.id = m."hostId" and u.email = ${MEMBER.email}
        and m.status = 'scheduled' and m."deletedAt" is null`;
    await sql.end();
  });

  test("refuses a fourth upcoming scheduled meeting and a 2-hour one", async ({
    newPage,
  }) => {
    const host = await newPage();
    await signInAs(host, MEMBER);

    for (let i = 0; i < 3; i++) {
      await schedule(host, `Cap test ${i}`, 30);
      await host.waitForURL(/\/meetings\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    }
    await schedule(host, "One too many", 30);
    await expect(
      host.getByText(/allows 3 upcoming scheduled meetings/i),
    ).toBeVisible();

    await host.goto("/schedule");
    await schedule(host, "Too long", 120);
    await expect(host.getByText(/meetings up to 40 minutes/i)).toBeVisible();
  });

  test("breakout rooms are not offered on free", async ({ newPage }) => {
    const host = await newPage();
    await signInAs(host, MEMBER);
    await host.goto("/dashboard");
    await host.getByRole("button", { name: /new meeting/i }).click();
    await host.waitForURL(/\/m\//);
    await joinRoom(host, MEMBER.name);
    await expect(host.getByRole("button", { name: /breakout/i })).toHaveCount(
      0,
    );
  });

  test("the sixth person is turned away at the door", async ({ newPage }) => {
    test.slow();
    const host = await newPage();
    await signInAs(host, MEMBER);
    await host.goto("/dashboard");
    await host.getByRole("button", { name: /new meeting/i }).click();
    await host.waitForURL(/\/m\//);
    const code = host.url().split("/m/")[1]?.split("?")[0] as string;
    await joinRoom(host, MEMBER.name);
    // Waiting room off so guests connect straight away.
    await host.getByRole("button", { name: /^settings$/i }).click();
    await host.getByRole("switch", { name: /waiting room/i }).click();
    await host.keyboard.press("Escape");

    for (let i = 1; i <= 4; i++) {
      const guest = await newPage();
      await guest.goto(`/m/${code}`);
      await joinRoom(guest, `Guest ${i}`);
    }
    // Attendance rows land via the LiveKit webhook → Inngest hop.
    await expect(host.getByText(/5 participants/i)).toBeVisible({
      timeout: 20_000,
    });

    const sixth = await newPage();
    await sixth.goto(`/m/${code}`);
    await submitPreJoin(sixth, "Guest 5");
    await expect(sixth.getByText(/this meeting is full/i)).toBeVisible();
  });
});

async function schedule(
  page: import("@playwright/test").Page,
  title: string,
  minutes: number,
) {
  await page.goto("/schedule");
  await page.getByLabel(/^title$/i).fill(title);
  const when = new Date(Date.now() + 2 * 60 * 60_000);
  when.setSeconds(0, 0);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await page.getByLabel(/date and time/i).fill(local);
  await page.getByLabel(/duration/i).click();
  await page
    .getByRole("option", { name: new RegExp(`^${minutes} minutes$`) })
    .click();
  await page.getByRole("button", { name: /^schedule$/i }).click();
}

test("a free organization sees an upgrade prompt instead of API keys", async ({
  newPage,
}) => {
  const host = await newPage();
  await signInAs(host, MEMBER);
  await host.goto("/settings/integrations");
  await expect(host.getByText(/part of the business plan/i)).toBeVisible();
  await expect(
    host.getByRole("button", { name: /new integration/i }),
  ).toHaveCount(0);
});
