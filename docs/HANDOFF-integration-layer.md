# Handoff: build the integration layer for Gateling Meetings

Copy everything below this line into a fresh Claude Code session opened in
`G:\apps\gateling-meetings`.

---

Build the **redirect-based integration layer** for this repo. The plan is fully written at
`C:\Users\moham\.claude\plans\i-need-to-build-ancient-hanrahan.md` — read it first and
follow it; this prompt only adds the context the plan assumes.

## What this repo is

A self-hosted Zoom/Meet alternative (Next.js 16, React 19, tRPC 11, Drizzle + Postgres,
LiveKit, Inngest, custom auth, EN + AR i18n). It is **complete and committed** (7 commits,
`git log --oneline`): instant + scheduled meetings, waiting room, host controls, breakout
rooms, invites with `.ics`, reminders, attendance via LiveKit webhooks. Both a
security-reviewer and a code-reviewer pass were done and fixed. Do not refactor what exists;
the integration layer is **additive**.

Read `README.md` and `AGENTS.md`, then skim these — they are what you will build on:

- `src/features/meetings/server/meetings-router.ts` — create/update/end/delete (the logic
  to extract into `service.ts` so REST and tRPC share it)
- `src/features/meetings/server/join-router.ts` — the one door into a room; note how an
  `inviteToken` skips passcode + waiting room (participant SSO links reuse this)
- `src/features/core/auth/core/session.ts` — `createUserSession()` (host SSO links use this)
- `src/integrations/inngest/functions/on-livekit-webhook.ts` — where outbound webhooks hook in
- `src/integrations/inngest/send.ts` — event publishing is non-fatal; keep that pattern
- `src/integrations/ratelimit.ts`, `src/integrations/security/csp.ts`, `src/proxy.ts`
- `src/data/env/server.ts` — env validation; production fails the build on missing values
- `src/drizzle/schemas/meetings/*` and `src/drizzle/schemas/auth/users-table.ts`
  (there is **no role column** — admin access is by `ADMIN_EMAILS` env, per the plan)
- `e2e/fixtures.ts`, `e2e/helpers.ts`, `e2e/schedule.spec.ts` — the e2e style to copy

## Deployment target

Production is **https://meetings.gateling.com on Vercel** (`BASE_URL` = that). Other Gateling
systems (atelier-management-system, gateling-tms, gateling.com — all Next.js 16 + tRPC) are
the API consumers. They will call the REST API server-to-server with an API key and redirect
their users to the signed `/sso/join` link. No iframe/embedding; CSP `frame-ancestors 'none'`
stays.

## Local environment (already set up on this machine)

```bash
npm run db:start      # Postgres in Docker on :5434
npm run livekit       # LiveKit OSS in Docker (livekit.dev.yaml, ws://localhost:7880)
npm run inngest       # Inngest dev server on :8288
npm run dev           # Next on :3000
```

`.env` exists. Test host account: `host@example.test` / `Passw0rd!Local` (already
email-verified). SMTP is not configured — emails log and skip, that is expected.
Sessions use a borrowed dev Upstash Redis (from gateling.com) — fine locally, swap before deploy.

## Rules that bit me — follow them

1. **Migrations are generated**: edit `src/drizzle/schemas/**`, then `npm run db:generate`
   and `npm run db:migrate`. Never hand-write, never `db:push`. Commit the `.sql` + `meta/`.
2. **Every string through `t()`**, and every key added to `meetings-en.ts`/`…-ar.ts` (or a new
   `integrations-en.ts`/`-ar.ts` registered in `src/features/core/i18n/global/`) in the same
   change. Arabic plurals use `zero/one/two/few/many/other`.
3. **Logical CSS only** (`ms-`/`me-`/`ps-`/`pe-`/`start-`/`end-`), shadcn components not raw
   divs, semantic color tokens.
4. **Gate after every substantive step**:
   `npx tsc --noEmit && npx biome check --write . && npx vitest run && npx playwright test && npx next build`.
   Playwright uses fake media in two isolated contexts; the suite takes ~1.5 min. One local
   retry is configured; if a spec fails twice, it is real.
5. **Turbopack HMR can keep a stale server module** after you change a file that a route
   imports. If a route behaves as if your edit is missing, restart `npm run dev` before
   debugging further (cost me 20 minutes once).
6. **Bash heredocs in this shell choke** on Next route-group paths like `src/app/(app)/…` and
   on some backslash sequences. Write such files with the Write tool or a `.mjs` patch script
   run with `node`.
7. Inngest `step.run` **JSON-serialises return values** — never return a row with `Date`s from
   a step and use it later; load inside the step that needs it (see `meeting-loaders.ts`).
8. Anything security-relevant **never trusts LiveKit participant attributes** (clients can
   rewrite their own). Roles come from the database / the token grant. Data-channel handlers
   act only on server-originated messages (`message.from == null`).
9. Commit per phase with a descriptive message; end commit messages with
   `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Do not push — there is no remote yet.

## Suggested order

1. Schema + migration (`integrations`, `linked_users`, `sso_tokens`, `webhook_deliveries`,
   two columns on `meetings`).
2. `service.ts` extraction + `withIntegration` API wrapper + `/api/v1/meetings` routes
   (with unit tests for key hashing, JWT, idempotency).
3. `/sso/join` + error page + `LeftScreen` return link + `?name=` prefill on pre-join.
4. Outbound webhooks (Inngest) + `docs/webhooks.md`.
5. Admin UI `/settings/integrations` + `ADMIN_EMAILS`.
6. `e2e/integration.spec.ts` (drives the whole loop incl. receiving a signed webhook via a
   local `http.createServer` in the spec) + `docs/integration.md` with the drop-in client.
7. Run the `security-reviewer` and `code-reviewer` agents on the diff; fix CRITICAL/HIGH;
   final gate; commit.

## When done, report

What was built, what the gate says (paste counts), anything you deliberately left out, and
the exact env vars to add on Vercel.
