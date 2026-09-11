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

The e2e suite expects the dev server, Postgres and LiveKit above to be running
and a verified host account `host@example.test` / `Passw0rd!Local` (sign up
once, then `UPDATE users SET "emailVerifiedAt" = now()` if SMTP isn't
configured locally). `e2e/visual.spec.ts` writes RTL/mobile screenshots to
`test-results/visual/`.

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
