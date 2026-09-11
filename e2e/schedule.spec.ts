import postgres from "postgres";
import { expect, test } from "./fixtures";

import { expectInRoom, signIn, submitPreJoin } from "./helpers";

/**
 * Scheduling: the form creates a scheduled meeting with an invitee, the
 * detail page shows it, the invitee's link (token read straight from the
 * database — the email is not sent without SMTP) skips the waiting room,
 * and the personal room is created once and reused.
 */
test("schedule a meeting, invite by link, personal room", async ({
  newPage,
}) => {
  const sql = postgres(process.env.DATABASE_URL as string);
  const host = await newPage();
  await signIn(host);

  // --- schedule
  await host.goto("/schedule");
  await host.getByLabel(/^title$/i).fill("Planning review");
  const when = new Date(Date.now() + 2 * 60 * 60_000);
  when.setSeconds(0, 0);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
  await host.getByLabel(/date and time/i).fill(local);
  await host.getByLabel(/invite by email/i).fill("invitee@example.test");
  await host.getByRole("button", { name: /^schedule$/i }).click();
  await host.waitForURL(/\/meetings\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
  const code = host.url().split("/").pop() as string;

  await expect(
    host.getByRole("heading", { name: "Planning review" }),
  ).toBeVisible();
  await expect(host.getByText(/^scheduled$/i)).toBeVisible();
  await expect(host.getByText("invitee@example.test")).toBeVisible();
  await expect(host.getByText(/waiting room on/i)).toBeVisible();

  // --- dashboard lists it under Upcoming
  await host.goto("/dashboard");
  await expect(host.getByText(/^upcoming$/i)).toBeVisible();
  await expect(host.getByText("Planning review").first()).toBeVisible();

  // --- invite link skips the waiting room (token from the DB)
  const [invite] = await sql<{ token: string }[]>`
    select i.token from meeting_invites i
    join meetings m on m.id = i."meetingId"
    where m.code = ${code} and i.email = 'invitee@example.test'`;
  expect(invite?.token).toBeTruthy();

  const invitee = await newPage();
  await invitee.goto(`/m/${code}?invite=${invite?.token}`);
  await expect(invitee.getByText(/starts /i)).toBeVisible();
  await submitPreJoin(invitee, "Invited Ivy");
  await expectInRoom(invitee);

  // --- a plain visitor still waits
  const walkIn = await newPage();
  await walkIn.goto(`/m/${code}`);
  await submitPreJoin(walkIn, "Walk-in Wade");
  await expect(walkIn.getByText(/waiting for the host/i)).toBeVisible();

  // --- personal room: created on first click, same code afterwards
  await host.goto("/dashboard");
  const setUp = host.getByRole("button", { name: /set up my room/i });
  if (await setUp.isVisible().catch(() => false)) {
    await setUp.click();
  }
  await expect(host.getByRole("link", { name: /open room/i })).toBeVisible({
    timeout: 10_000,
  });
  const personalHref = await host
    .getByRole("link", { name: /open room/i })
    .getAttribute("href");
  await host.reload();
  await expect(host.getByRole("link", { name: /open room/i })).toHaveAttribute(
    "href",
    personalHref as string,
  );

  // --- delete the scheduled meeting; the link dies
  await host.goto(`/meetings/${code}`);
  // The dev server can be mid-hydration on first paint; retry the click
  // until the dialog actually opens rather than trusting one click.
  await expect(async () => {
    await host.getByRole("button", { name: /delete meeting/i }).click();
    await expect(host.getByRole("alertdialog")).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await host
    .getByRole("alertdialog")
    .getByRole("button", { name: /^delete$/i })
    .click();
  await host.waitForURL(/\/dashboard/);
  const gone = await newPage();
  const response = await gone.goto(`/m/${code}`);
  expect(response?.status()).toBe(404);

  await sql.end();
});
