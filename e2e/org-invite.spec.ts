import postgres from "postgres";
import { expect, test } from "./fixtures";

import { MEMBER, signInAs } from "./helpers";

/**
 * A team organization end to end: the member creates one, gets three seats
 * (comped in the database — the admin UI is covered in admin.spec.ts),
 * invites a fresh address, hands over the link; the invitee signs up with
 * that address, accepts, and both sides see the membership. A wrong
 * account cannot accept.
 */
test("create a team organization, invite by link, accept", async ({
  newPage,
}) => {
  const sql = postgres(process.env.DATABASE_URL as string);
  const stamp = Date.now();
  const orgName = `Team ${stamp}`;
  const inviteeEmail = `invitee-${stamp}@example.test`;

  const owner = await newPage();
  await signInAs(owner, MEMBER);

  // --- create the org from the switcher
  await owner.goto("/dashboard");
  await owner.getByRole("button", { name: /^organization$/i }).click();
  await owner.getByRole("menuitem", { name: /new organization/i }).click();
  await owner.getByLabel(/organization name/i).fill(orgName);
  await owner.getByRole("button", { name: /^create$/i }).click();
  await owner.waitForURL(/\/settings\/organization/);
  await expect(owner.getByRole("heading", { name: orgName })).toBeVisible();

  // --- one seat: inviting is replaced by "Add a seat"
  await expect(owner.getByRole("link", { name: /add a seat/i })).toBeVisible();
  await sql`update organizations set "seatLimit" = 3 where name = ${orgName}`;
  await owner.reload();

  // --- invite
  await owner.getByRole("button", { name: /invite someone/i }).click();
  await owner.getByLabel(/^email$/i).fill(inviteeEmail);
  await owner.getByRole("button", { name: /send invitation/i }).click();
  await expect(owner.getByText(/invitation link/i)).toBeVisible();
  const link = await owner.getByRole("textbox").last().inputValue();
  expect(link).toMatch(/\/invite\/[0-9a-f]{64}$/);
  await owner
    .getByRole("button", { name: /^close$/i })
    .last()
    .click();
  await expect(owner.getByText(inviteeEmail).first()).toBeVisible();

  // --- the wrong account cannot accept
  const stranger = await newPage();
  await signInAs(stranger, MEMBER);
  await stranger.goto(link);
  await expect(stranger.getByText(/different email address/i)).toBeVisible();

  // --- the invitee signs up with the invited address and accepts
  const invitee = await newPage();
  await invitee.goto(link);
  await invitee.getByRole("link", { name: /create an account/i }).click();
  await invitee.getByLabel(/full name/i).fill("Invited Ines");
  await invitee.getByLabel(/^email$/i).fill(inviteeEmail);
  await invitee.getByLabel(/phone/i).fill(`+2010${String(stamp).slice(-8)}`);
  await invitee.getByLabel(/^password$/i).fill("Passw0rd!Local");
  await invitee
    .getByRole("button", { name: /create account|sign up/i })
    .click();
  await invitee.waitForURL(/\/(auth\/verify-email|dashboard|invite)/);
  // No SMTP locally — verify by hand, as the README says.
  await sql`update users set "emailVerifiedAt" = now() where email = ${inviteeEmail}`;
  await invitee.goto(link);
  await invitee
    .getByRole("button", { name: new RegExp(`join ${orgName}`, "i") })
    .click();
  await invitee.waitForURL(/\/dashboard/);
  await expect(
    invitee.getByRole("button", { name: /^organization$/i }),
  ).toContainText(orgName);

  // --- the owner sees the member; the invite is gone
  await owner.reload();
  await expect(owner.getByText("Invited Ines")).toBeVisible();
  await expect(owner.getByText(/no pending invitations/i)).toBeVisible();

  await sql`delete from organizations where name = ${orgName}`;
  await sql.end();
});
