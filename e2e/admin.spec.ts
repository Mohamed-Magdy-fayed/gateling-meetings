import postgres from "postgres";
import { expect, test } from "./fixtures";

import { HOST, MEMBER, signInAs } from "./helpers";

/**
 * The comp lever: an admin puts the member's org on Pro by hand, the member
 * sees it on their billing page, and it comes back off. A pre-grant for an
 * address that has not signed up is listed as pending and can be withdrawn.
 */
test("admin comps an organization and withdraws a pending grant", async ({
  newPage,
}) => {
  const admin = await newPage();
  await signInAs(admin, HOST);

  await admin.goto("/admin");
  await admin.getByPlaceholder(/search by name or email/i).fill(MEMBER.email);
  await admin
    .getByRole("link", { name: /^manage$/i })
    .first()
    .click();
  await admin.waitForURL(/\/admin\/organizations\//);

  await admin.getByLabel(/^plan$/i).click();
  await admin.getByRole("option", { name: /^pro$/i }).click();
  await admin.getByLabel(/how they got it/i).click();
  await admin.getByRole("option", { name: /granted by hand/i }).click();
  await admin.getByLabel(/seat limit/i).fill("3");
  await admin.getByRole("button", { name: /save plan/i }).click();
  await expect(admin.getByText(/plan updated/i)).toBeVisible();

  const member = await newPage();
  await signInAs(member, MEMBER);
  await member.goto("/settings/billing");
  await expect(member.getByText(/^pro$/i).first()).toBeVisible();
  await expect(member.getByText(/^granted$/i).first()).toBeVisible();

  // --- back to free
  await admin.getByLabel(/^plan$/i).click();
  await admin.getByRole("option", { name: /^free$/i }).click();
  await admin.getByLabel(/how they got it/i).click();
  await admin.getByRole("option", { name: /free \(no override\)/i }).click();
  await admin.getByRole("button", { name: /save plan/i }).click();
  await expect(admin.getByText(/plan updated/i)).toBeVisible();
  await member.reload();
  await expect(member.getByText(/^free$/i).first()).toBeVisible();

  // --- pending grant
  const email = `pilot-${Date.now()}@example.test`;
  await admin.goto("/admin/grants");
  await admin.getByRole("button", { name: /new grant/i }).click();
  await admin.getByLabel(/^email$/i).fill(email);
  await admin.getByRole("button", { name: /create grant/i }).click();
  await expect(admin.getByText(/waiting for that address/i)).toBeVisible();
  await expect(admin.getByText(email)).toBeVisible();

  const sql = postgres(process.env.DATABASE_URL as string);
  const [grant] = await sql<{ consumedAt: Date | null }[]>`
    select "consumedAt" from plan_grants where email = ${email}`;
  expect(grant?.consumedAt).toBeNull();
  await sql.end();

  await admin
    .getByRole("row", { name: new RegExp(email) })
    .getByRole("button", { name: /withdraw/i })
    .click();
  await admin
    .getByRole("button", { name: /^withdraw$/i })
    .last()
    .click();
  await expect(admin.getByText(/grant withdrawn/i)).toBeVisible();
});
