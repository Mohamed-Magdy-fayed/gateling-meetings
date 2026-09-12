import http from "node:http";
import type { AddressInfo } from "node:net";

import { verifyWebhookSignature } from "../src/integrations/webhooks/signature";
import { expect, test } from "./fixtures";
import { expectInRoom, signIn, submitPreJoin } from "./helpers";

/**
 * The whole integration loop, as another Gateling system would drive it:
 * an admin creates an integration and copies the key → the "other system"
 * (this spec, with `fetch`) creates a meeting and mints join links → the
 * host link lands in the room *as host* with no sign-in page, the
 * participant link lands straight in with the name prefilled while the
 * waiting room is on, a second use of the host link is refused → the
 * attendance log lists both → "End for all" delivers a signed
 * `meeting.ended` webhook to a local receiver, and the leave screen offers
 * the way back to the sending system.
 *
 * Besides the usual dev server + Postgres + LiveKit, this needs
 * `npm run inngest` (webhook delivery and the attendance log both go
 * through Inngest) — the spec fails fast with a clear message otherwise.
 */
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const INNGEST_DEV_URL = "http://localhost:8288";

type ReceivedDelivery = {
  headers: http.IncomingHttpHeaders;
  body: string;
};

test("another system creates a meeting, sends a host and a guest in, hears back", async ({
  newPage,
}) => {
  test.setTimeout(180_000);
  const inngestUp = await fetch(INNGEST_DEV_URL)
    .then((response) => response.ok)
    .catch(() => false);
  expect(
    inngestUp,
    `Inngest dev server not reachable at ${INNGEST_DEV_URL} — run "npm run inngest"`,
  ).toBe(true);

  // --- a webhook receiver the integration "owns"
  const received: ReceivedDelivery[] = [];
  const receiver = http.createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push({ headers: request.headers, body });
      response.writeHead(200).end("ok");
    });
  });
  await new Promise<void>((resolve) =>
    receiver.listen(0, "127.0.0.1", resolve),
  );
  const port = (receiver.address() as AddressInfo).port;
  const origin = `http://127.0.0.1:${port}`;

  try {
    // --- admin creates the integration and copies the credentials
    const admin = await newPage();
    await signIn(admin);
    await admin.goto("/settings/integrations");
    await admin.getByRole("button", { name: /new integration/i }).click();
    const suffix = Date.now().toString(36);
    await admin.getByLabel(/^name$/i).fill(`E2E ${suffix}`);
    await admin.getByLabel(/^slug$/i).fill(`e2e-${suffix}`);
    await admin.getByLabel(/webhook url/i).fill(`${origin}/hook`);
    await admin.getByLabel(/allowed return origins/i).fill(origin);
    await admin.getByRole("button", { name: /^create$/i }).click();

    const keyDialog = admin.getByRole("dialog").filter({
      hasText: /copy the api key/i,
    });
    await expect(keyDialog).toBeVisible();
    const apiKey = (await keyDialog.locator("#api-key").textContent()) ?? "";
    const webhookSecret =
      (await keyDialog.locator("#webhook-secret").textContent()) ?? "";
    expect(apiKey).toMatch(/^gm_live_/);
    expect(webhookSecret).toMatch(/^whsec_/);
    await keyDialog.getByRole("button", { name: /^done$/i }).click();
    await expect(admin.getByText(`E2E ${suffix}`)).toBeVisible();

    const api = (path: string, init: RequestInit = {}) =>
      fetch(`${BASE}/api/v1${path}`, {
        ...init,
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });

    // --- the other system creates a meeting (idempotently)
    const createBody = JSON.stringify({
      title: "Order review",
      externalRef: `order:${suffix}`,
      host: { externalId: `host-${suffix}`, name: "SSO Host" },
    });
    const created = await api("/meetings", {
      method: "POST",
      body: createBody,
      headers: { "idempotency-key": `create-${suffix}` },
    });
    expect(created.status).toBe(201);
    const { meeting } = (await created.json()) as {
      meeting: { code: string; status: string; externalRef: string };
    };
    expect(meeting.status).toBe("live");
    expect(meeting.externalRef).toBe(`order:${suffix}`);

    const replayed = await api("/meetings", {
      method: "POST",
      body: createBody,
      headers: { "idempotency-key": `create-${suffix}` },
    });
    expect(replayed.headers.get("idempotent-replayed")).toBe("true");
    expect(
      ((await replayed.json()) as { meeting: { code: string } }).meeting.code,
    ).toBe(meeting.code);

    const found = await api(`/meetings?externalRef=order:${suffix}`);
    expect(
      ((await found.json()) as { meetings: { code: string }[] }).meetings.map(
        (m) => m.code,
      ),
    ).toEqual([meeting.code]);

    // --- mint links
    const mintLink = async (body: Record<string, unknown>) => {
      const response = await api(`/meetings/${meeting.code}/join-links`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(201);
      return ((await response.json()) as { joinLink: { url: string } }).joinLink
        .url;
    };
    const hostLink = await mintLink({
      user: { externalId: `host-${suffix}`, name: "SSO Host" },
      role: "host",
      returnUrl: `${origin}/back?order=${suffix}`,
    });
    const guestLink = await mintLink({
      user: { externalId: `guest-${suffix}`, name: "Pat Participant" },
      role: "participant",
    });

    // A stranger cannot get a host link.
    const notHost = await api(`/meetings/${meeting.code}/join-links`, {
      method: "POST",
      body: JSON.stringify({
        user: { externalId: "someone-else", name: "Someone" },
        role: "host",
      }),
    });
    expect(notHost.status).toBe(403);

    // --- host link: straight to the room, as host, no sign-in page
    const host = await newPage();
    await host.goto(hostLink);
    await host.waitForURL(new RegExp(`/m/${meeting.code}$`));
    await submitPreJoin(host, "SSO Host");
    await expectInRoom(host);
    await expect(
      host.getByRole("button", { name: /end for all/i }),
    ).toBeVisible();
    await expect(
      host.getByRole("button", { name: /^settings$/i }),
    ).toBeVisible();

    // --- participant link: name prefilled, waiting room skipped
    const guest = await newPage();
    await guest.goto(guestLink);
    await guest.waitForURL(new RegExp(`/m/${meeting.code}\\?invite=`));
    await expect(guest.getByPlaceholder(/how should we call you/i)).toHaveValue(
      "Pat Participant",
    );
    await guest.getByRole("button", { name: /join now/i }).click();
    await expectInRoom(guest);
    await expect(host.getByText(/2 participants/)).toBeVisible({
      timeout: 15_000,
    });

    // --- the host link is single-use
    const replay = await newPage();
    await replay.goto(hostLink);
    await replay.waitForURL(/\/sso\/error\?reason=used/);
    await expect(replay.getByText(/already used/i)).toBeVisible();

    // --- attendance log (LiveKit webhook → Inngest → meeting_participants)
    await expect
      .poll(
        async () => {
          const response = await api(`/meetings/${meeting.code}/participants`);
          const { participants } = (await response.json()) as {
            participants: { role: string; externalId: string | null }[];
          };
          return participants
            .map((p) => `${p.role}:${p.externalId ?? "-"}`)
            .sort();
        },
        { timeout: 30_000, message: "attendance log should list both" },
      )
      .toEqual([`host:host-${suffix}`, "participant:-"]);

    // --- end for all → signed meeting.ended webhook, and a way back
    await host.getByRole("button", { name: /end for all/i }).click();
    await host
      .getByRole("alertdialog")
      .getByRole("button", { name: /end for all/i })
      .click();
    await expect(host.getByText(/this meeting has ended/i)).toBeVisible({
      timeout: 15_000,
    });
    const back = host.getByRole("link", { name: `Back to E2E ${suffix}` });
    await expect(back).toHaveAttribute(
      "href",
      `${origin}/back?order=${suffix}`,
    );

    await expect
      .poll(
        () =>
          received.some(
            (d) => d.headers["x-meetings-event"] === "meeting.ended",
          ),
        { timeout: 30_000, message: "meeting.ended should be delivered" },
      )
      .toBe(true);
    const delivery = received.find(
      (d) => d.headers["x-meetings-event"] === "meeting.ended",
    ) as ReceivedDelivery;
    expect(
      verifyWebhookSignature({
        secret: webhookSecret,
        header: delivery.headers["x-meetings-signature"] as string,
        body: delivery.body,
      }),
    ).toBe(true);
    expect(
      verifyWebhookSignature({
        secret: "whsec_wrong",
        header: delivery.headers["x-meetings-signature"] as string,
        body: delivery.body,
      }),
    ).toBe(false);
    const payload = JSON.parse(delivery.body) as {
      event: string;
      data: { meeting: { code: string; status: string }; endedBy: string };
    };
    expect(payload.data.meeting.code).toBe(meeting.code);
    expect(payload.data.meeting.status).toBe("ended");
    expect(payload.data.endedBy).toBe("host");

    // --- the API sees it ended too; a new link is refused
    const after = await api(`/meetings/${meeting.code}`);
    expect(
      ((await after.json()) as { meeting: { status: string } }).meeting.status,
    ).toBe("ended");
    const tooLate = await api(`/meetings/${meeting.code}/join-links`, {
      method: "POST",
      body: JSON.stringify({
        user: { externalId: `guest-${suffix}`, name: "Pat" },
        role: "participant",
      }),
    });
    expect(tooLate.status).toBe(412);

    // --- the admin page shows the delivery
    await admin.reload();
    await expect(
      admin.getByRole("row").filter({ hasText: "meeting.ended" }).first(),
    ).toContainText(/delivered/i, { timeout: 15_000 });
  } finally {
    await new Promise<void>((resolve) => receiver.close(() => resolve()));
  }
});
