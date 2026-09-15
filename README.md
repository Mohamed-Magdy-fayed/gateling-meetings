# Gateling Meetings

Video meetings you host yourself — Google Meet's frictionless join (browser
only, guests need no account) with Zoom's host controls. Media rides on
[LiveKit](https://livekit.io) (open-source SFU); the app is Next.js 16 with the
shared Gateling core (custom auth, EN/AR i18n, tRPC, Drizzle, Inngest).

Runs at **$0/month** on free tiers: Vercel Hobby + LiveKit Cloud free +
Neon + Upstash + Inngest. No recording (that is the one paid LiveKit
feature), so nothing here needs a credit card.

## Local development

```bash
cp .env.example .env          # fill DATABASE_URL, REDIS_URL/TOKEN, LIVEKIT_*
npm install
npm run db:start              # Postgres in Docker (port 5434)
npm run db:migrate
npm run livekit               # LiveKit dev server in Docker (ws://localhost:7880, devkey/secret)
npm run inngest               # optional: Inngest dev UI for background jobs
npm run dev
```

`LIVEKIT_URL=ws://localhost:7880`, `LIVEKIT_API_KEY=devkey`,
`LIVEKIT_API_SECRET=secret` match `livekit.dev.yaml`. To use LiveKit Cloud
instead, paste the project's `wss://…livekit.cloud` URL and API key/secret —
nothing else changes.

Sessions live in Upstash Redis (`REDIS_URL` / `REDIS_TOKEN`); the free tier is
enough.

## Verification

```bash
npm run check        # typecheck + biome
npm test             # vitest unit tests (tests/)
npm run test:e2e     # Playwright: host + guest in two isolated contexts with fake media
```

The e2e suite expects the dev server, Postgres, LiveKit and the Inngest dev
server above to be running (`livekit.dev.yaml` posts room events to the dev
server, which hands them to Inngest — that is how the attendance log and the
integration webhooks work locally) and a verified host account `host@example.test` / `Passw0rd!Local` (sign up
once, then `UPDATE users SET "emailVerifiedAt" = now()` if SMTP isn't
configured locally). `e2e/entitlements.spec.ts` and `e2e/admin.spec.ts` also need a
*second*, non-admin account `member@example.test` / `Passw0rd!Local` (same steps; it must
**not** be in `ADMIN_EMAILS`, because admin accounts bypass every plan cap).
`e2e/visual.spec.ts` writes RTL/mobile screenshots to `test-results/visual/`.

## Architecture in one paragraph

A meeting is a row in `meetings` whose `code` (`abc-defg-hij`) is also the
LiveKit room name. `join.request` is the only door into a room: it checks the
meeting state, passcode and settings, then mints a LiveKit access token whose
grants encode the role (`roomAdmin` for the host). Chat, reactions and hand
raise ride LiveKit's data channel and participant attributes; the server only
persists meetings, scheduling and the waiting-room queue.

## Database changes

Schema-first: edit `src/drizzle/schemas/**`, then `npm run db:generate` and
`npm run db:migrate`. Never hand-write a migration for a shape change; never
`db:push`.

## Features

- **Instant meetings** — one click, straight into the room; share `/m/abc-defg-hij`.
- **Guests need no account** — pre-join lobby with camera/mic preview, join by name.
- **Waiting room** — host admits/denies (toast with an Admit action), or turns it off.
- **Host controls** — mute one / mute all, remove, lower hands, lock the meeting, mute-on-entry, allow/deny screen share and guests — all from a settings popover in the room.
- **Room** — grid or speaker view, pin any tile, auto-focused screen share, chat, reactions, hand raise (M / V / H shortcuts), connection-quality warning, RTL Arabic.
- **Scheduling** — date/time + zone, duration, optional passcode, invitees by email; each gets a link that skips the passcode and waiting room, an `.ics` attachment, an "Add to Google Calendar" link, and a reminder 10 minutes before.
- **Personal room** — a permanent link per host.
- **Breakout rooms** — create, assign or shuffle, open, visit, broadcast to all rooms, close all. Seamless on LiveKit Cloud; a quick reconnect on the open-source server.
- **Attendance log** — from LiveKit webhooks (`/api/livekit/webhook`), via Inngest.
- **Plans and organizations** — every account owns a personal organization; the org's plan (`free` / `pro` / `business`, see `src/features/billing/plans.ts`) caps participants, meeting length, upcoming scheduled meetings, breakouts and API access. Free is 5 people / 40 minutes. Enforced at the join door, the meeting service and an Inngest duration enforcer — never only in the UI. `ADMIN_EMAILS` accounts are unlimited.
- **Billing** — Paddle (merchant of record): overlay checkout from `/settings/billing` or `/pricing`, per-seat subscriptions, customer portal, cancellation at period end. Webhooks land in `billing_events` (idempotent by Paddle event id) and are applied by Inngest. A plan set by hand in the admin panel is never overwritten by billing.
- **Legal pages** — `/terms`, `/privacy`, `/refund-policy`, in English and Arabic, rendered from `src/features/legal/content/*` and linked from the footer of every page outside a room. The seller name, contact email and effective date live in `src/features/legal/content/types.ts`; edit the content there, not in a CMS.
- **Admin panel** — `/admin` (`ADMIN_EMAILS` only): search organizations, put any org on any plan (`manual` source, optional expiry, note), pre-grant a plan to an email before they sign up, list users.
- **Integration API** — other Gateling systems create meetings and send their signed-in users in through a signed `/sso/join` link, and get signed webhooks back. See [docs/integration.md](docs/integration.md) and [docs/webhooks.md](docs/webhooks.md); Business-plan organizations mint their own keys at `/settings/integrations` (platform admins can mint uncapped platform keys).

## Deploying (all free tiers)

1. **LiveKit Cloud** — create a project; copy the `wss://…livekit.cloud` URL and an API key/secret. Add a webhook pointing at `https://<your-app>/api/livekit/webhook`.
2. **Neon** — a Postgres database; `DATABASE_URL`. Run `npm run db:migrate` against it once.
3. **Upstash** — a Redis database; `REDIS_URL` + `REDIS_TOKEN`.
4. **Inngest** — create an app; `INNGEST_SIGNING_KEY` + `INNGEST_EVENT_KEY`. After the first deploy, sync the app at `https://<your-app>/api/inngest`.
5. **SMTP** — any provider (`SMTP_*`) for invite/reminder/verification emails.
6. **Paddle** — create one recurring per-seat price per plan and billing interval (Pro and Business, monthly and yearly — `npx tsx scripts/seed-paddle-catalog.ts` does it; launch pricing is USD 3 / 6 per seat per month and USD 30 / 60 per seat per year, with regional overrides). The pricing page asks Paddle.js for the visitor's localized price (`Paddle.PricePreview`) and shows the string Paddle returns, so change amounts in Paddle, not in code. Set `PADDLE_API_KEY`, `PADDLE_WEBHOOK_SECRET`, the four `PADDLE_PRICE_ID_{PRO,BUSINESS}_{MONTH,YEAR}`, `PADDLE_ENVIRONMENT=production`, and the client-side `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN` / `NEXT_PUBLIC_PADDLE_ENVIRONMENT` (both `*_ENVIRONMENT` values are required everywhere — the app refuses to start without them). Under **Checkout → Checkout settings** set the default payment link to `https://<your-app>/pricing` (an approved domain, not localhost). Add a notification destination for `subscription.*` and `transaction.completed` pointing at `https://<your-app>/api/paddle/webhook`, and approve your domain for checkout. Test in the sandbox first (`PADDLE_ENVIRONMENT=sandbox`); the live account is a separate catalog with its own price ids, keys and webhook secret, so every `PADDLE_*` value changes when you switch. In production the webhook route only accepts posts from Paddle's published addresses (fetched from `https://api.paddle.com/ips` at runtime and cached an hour) — if you put another proxy in front of Vercel it must set `x-forwarded-for` to the real client, not append to it.
7. **Vercel** — import the repo, set every variable above plus `BASE_URL`, `OAUTH_REDIRECT_URL_BASE` (`<BASE_URL>/api/oauth`), `JWT_SECRET_KEY` (32+ random chars, signs integration join links), `ADMIN_EMAILS` (who may open `/admin` and manage integrations) and, optionally, `GOOGLE_CLIENT_ID/SECRET`. The env module fails the build if a required production value is missing.

Self-hosting LiveKit instead: run `livekit/livekit-server` with a real config (open UDP range, TURN), and point `LIVEKIT_URL`/key/secret at it. Nothing in the app changes.
