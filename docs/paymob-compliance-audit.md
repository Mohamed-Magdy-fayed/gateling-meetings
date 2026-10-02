# Paymob merchant compliance audit — Gateling Meetings

Audit date: 2026-10-01 · Branch: `feat/paymob-compliance` · Scope: `meetings.gateling.com`

Status legend: **PASS** · **PARTIAL** · **FAIL** · **N/A**. "Before" is what the
code did when the audit started; "After" is the state once the fixes below
were committed. Evidence is `path:line` at the time of the audit.

## Stack map

| Concern | Where |
|---|---|
| Framework | Next.js 16 App Router, React 19, tRPC 11, deployed on Vercel |
| DB / ORM | Postgres (Neon) + Drizzle; migrations in `src/drizzle/migrations` |
| Auth | Custom sessions (Redis) + Google OAuth + WebAuthn; platform admins = `ADMIN_EMAILS` |
| Payment provider | Paymob Accept, unified checkout (hosted page, top-level redirect) + Paymob subscriptions — `src/integrations/paymob/*` |
| Checkout | `billing.createCheckout` — `src/features/billing/server/billing-router.ts:420` |
| Webhooks | `POST /api/billing/webhook/paymob/{transaction,subscription/<token>}` — `src/app/api/billing/webhook/[provider]/[...segments]/route.ts` |
| Webhook processing | Inngest `on-billing-webhook` — `src/integrations/inngest/functions/on-billing-webhook.ts` |
| Billing tables | `billing_checkouts`, `billing_events`, `billing_customers`, `billing_subscriptions` (+ `billing_transactions` added by this audit) |
| Email | Nodemailer `sendMail` — `src/integrations/email.ts` |
| Legal pages | `/terms`, `/privacy`, `/refund-policy`; content in `src/features/legal/content/*`; footer `src/features/legal/components/site-footer.tsx` |
| Logging | `console.*` → Vercel runtime logs; no error tracker, no request-body logging middleware |

## A. Card data & security

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| A1 | No PAN/CVV/expiry stored, logged or proxied | PASS | PASS | Card entry happens only on Paymob's unified checkout, reached by a top-level redirect (`src/integrations/paymob/client.ts:115-122`). Repo-wide grep for `cvv|cvc|card_number|expiry|pan` finds only the HMAC field name `source_data.pan` (`hmac.ts:28`, Paymob's masked last-4) and the token mirror, which keeps `masked_pan` + brand only (`billing-customers-table.ts:13,35`). No request-body logging middleware; webhook rejections log only the reason string (`route.ts:58-61`). `billing_events.payload` stores Paymob's callback verbatim, which contains the masked PAN and the billing name/email/phone, never a full PAN. |
| A2 | Keys in env only, never committed, never in client bundle | PASS | PASS | All Paymob keys are server-only `createEnv` entries (`src/data/env/server.ts:181-205`); `client.ts` and `provider.ts` import `server-only`. `.env*` is gitignored except `.env.example` (blank values). `git log --all -p` shows no Paymob key, HMAC secret or `.env` file ever committed. No `NEXT_PUBLIC_*` billing variable exists. The public key is put in the checkout URL by the server — that is its intended use. |
| A3 | Webhooks verify HMAC on every request; idempotent; redirect never marks paid | PASS | PASS | Transaction & token callbacks: HMAC-SHA512 with timing-safe compare (`hmac.ts:74-98`, `provider.ts:352-394`); invalid → 401, nothing stored (`route.ts:56-63`). Subscription webhook (unsigned by Paymob) is gated by a secret path token and only triggers a re-read from Paymob's API (`provider.ts:336-350`). Idempotency: unique `(provider, provider_event_id)` insert (`route.ts:84-95`, `billing-events-table.ts:418`). `/welcome` reads `success=false` only to pick copy, never to grant (`welcome/page.tsx:20-26`). |
| A4 | Payment confirmed server-side before granting access | PARTIAL | PASS | Access is granted only from the HMAC-verified callback (`on-billing-webhook.ts:385-459`). **Gap:** the callback's amount and currency were never compared with the checkout the server opened, and **refund/void callbacks were treated as successful payments** — a refund on the first charge re-ran `applyInitialPayment`, and a refund on a renewal rolled the period *forward* (`on-billing-webhook.ts:372-383, 461-518`). Fixed: refunds/voids are recognised and recorded (see G3); an initial payment whose amount/currency does not match the checkout is recorded as an error and grants nothing. |
| A5 | HTTPS, security headers, auth on billing/admin routes, rate limit on payment creation | PARTIAL | PASS | HSTS (2y, preload), nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, COOP (`next.config.ts:12-29`) + per-request nonce CSP (`src/proxy.ts`). Billing mutations are `orgAdminProcedure`, reads `orgProcedure`, admin router `adminProcedure`. **Gap:** `createCheckout` / `updateCardUrl` had no rate limit. Fixed: per-user Upstash limiter. |
| A6 | Incident-response note (who notifies Paymob) | FAIL | PASS | Added in `docs/payments.md` → "Incident response". Reviewed by the owner. |

## B. Personal data protection (PDPL 151/2020)

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| B1 | Privacy Policy exists, linked in footer and at checkout/sign-up | PARTIAL | PASS | `/privacy` exists, covers data, purposes, third parties incl. Paymob, rights, contact (`privacy.ts`). Linked in the footer (`site-footer.tsx:25-30`). **Gap:** not linked from sign-up or checkout. Fixed: consent line with links on sign-up and in the checkout dialog. |
| B2 | Customer data access-controlled, no cross-tenant exposure | PASS | PASS | Every billing read is scoped to `ctx.organization` from the session (`billing-router.ts:348-412, 601-614`); raw `billing_events` payloads are visible only on the platform-admin org page. New CSV export and transactions list are `adminProcedure` / admin-checked. |
| B3 | Transaction data kept ≥ 5 years | PARTIAL | PASS | No code deletes billing rows (no delete paths on billing tables; org deletion does not exist). **Gap:** privacy policy said "as long as needed"; `billing_checkouts` cascades on org delete. Fixed: policy now states 5 years, new ledger FK is `set null`. **Owner:** confirm Neon backup/PITR retention; never add an org-delete path without exporting the ledger first. |

## C. Checkout & pricing transparency

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| C1 | Final price in EGP before payment; no hidden fees/surcharge | PARTIAL | PASS | Per-seat EGP prices from one source (`tiers.ts:56-73`, `pricing-table.tsx`). **Gaps:** the checkout dialog showed plan + seats but not the total about to be charged; the EGP 1.00 card-update charge (`provider.ts:43`) was not disclosed. Fixed: dialog shows the exact total, interval and "no fees added"; card-update dialog discloses the EGP 1.00 verification charge. Prices are VAT-inclusive (owner confirmed); the pricing page, checkout and receipts say so. |
| C2 | Server charge equals displayed price | PASS | PASS | Amount computed server-side from plan × interval × seats (`billing-router.ts:441-445`); the browser never sends an amount. Now also cross-checked against the callback (A4). |
| C3 | Frequency, renewal and cancel shown before payment and in confirmation | PARTIAL | PASS | Terms describe renewal; the billing page shows "Renews {date}". **Gap:** nothing at the point of payment; no confirmation email. Fixed: checkout dialog states auto-renewal every 30/360 days and how to cancel; the receipt email repeats it. Also fixed: app assumed 365-day years while the Paymob plans and Terms use 360 (`on-billing-webhook.ts:214` vs `seed-paymob-plans.ts:42`). |

## D. Receipts

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| D1 | Email receipt on every payment, renewal and refund | FAIL | PASS | Nothing was sent. Fixed: Inngest step sends a bilingual receipt after each recorded successful payment/renewal and each refund/void — transaction id, date/time (Africa/Cairo), amount + currency, plan/seats, card brand + last 4 from Paymob's callback, merchant "Gateling", contact email, renewal/cancel note. Sent once per transaction (`receipt_sent_at`). **Receipts are only sent when SMTP is configured** — without it nothing is claimed and the admin list shows "No receipt sent". Confirm `SMTP_*` is set on Production. |

## E. Legal pages

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| E1 | Terms & Conditions | PASS | PASS | `/terms` covers service, AUP, billing, renewals, cancellation, liability, Egyptian law. Fixed one factual error (no change in promise). |
| E2 | Refund & Cancellation policy shown and accepted before payment; refunds to original card | PARTIAL | PASS | `/refund-policy` exists and says refunds go to the original card (`refunds.ts:123,171`). **Gap:** not shown/accepted before payment. Fixed: "By continuing you agree to the Terms and the Refund & Cancellation Policy" with links, directly above the pay button. Added the 90-day Paymob refund window (DRAFT). |
| E3 | Contact details: email, phone, address | PARTIAL | PASS | Footer shows info@gateling.com, phone and "Cairo, Egypt" on every non-meeting page (`site-footer.tsx:55-71`, `types.ts:96-107`). Owner confirmed "Cairo, Egypt" is sufficient for Paymob. |
| E4 | Footer links on every page | PASS | PASS | `SiteFooter` renders on landing, auth and app layouts (not inside a live meeting room). |

## F. Card scheme branding

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| F1 | Visa / Mastercard logos, official assets, removable | FAIL | PASS | Added `PaymentBrands` (single component, single config flag `PAYMENT_BRANDS` in `src/features/billing/payment-brands.ts`) rendered in the footer and checkout dialog. Marks live in `public/payment-brands/` and are on (owner approved). Swap in brand-centre artwork under the same file names any time. |

## G. Refunds & chargebacks

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| G1 | Refunds only through Paymob, to the original card | PASS | PASS | No code path issues money back in any form; refunds are done in the Paymob dashboard (procedure in `docs/payments.md`). |
| G2 | 90-day refund limit enforced/warned in admin UI | FAIL | PASS | New admin "Transactions" card per org shows each payment's refund deadline and flags ones past 90 days. |
| G3 | Refunds/voids recorded, linked to the original, update subscription status | FAIL | PASS | Previously a refund callback was mis-applied as a payment (A4). Fixed: refund/void callbacks are recorded in `billing_transactions` with `parent_transaction_id`, the parent is marked refunded/voided, and nothing is granted or extended. Verified on production 2026-10-02: Paymob reports a refund by re-sending the original payment with `is_refunded` + `refunded_amount_cents` (no callback for the refund itself); that is what is recorded. A full refund/void of the latest payment cancels at Paymob and ends the plan; partial refunds are recorded only. Admins can re-process a skipped/failed event. |
| G4 | Chargeback evidence (account creation, logins, usage with timestamps/IP) | PARTIAL | PARTIAL | Available: `users.created_at`, `users.last_sign_in_at`, `meeting_participants` join/leave timestamps (written from LiveKit webhooks), checkout row (who, when, what was agreed), plan activation in `billing_events`. **Missing:** a sign-in history with IP. Adding it means storing IPs — a privacy-policy change — so it's left as an owner decision. |
| G5 | Self-serve cancel | PASS | PASS | Settings → Billing → "Cancel subscription" (`billing-summary.tsx:381-395`). |

## H. Records retention

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| H1 | Transactions, receipts, refunds, usage retained ≥ 18 months | PARTIAL | PASS | No retention/cleanup job touches billing, meeting or participant tables (only `end-idle-meetings` cron, which ends rooms). Ledger rows survive org/user deletion (`set null`). Owner confirmed backup retention. The DB is the record (Vercel logs last days). |
| H2 | Admin CSV export by date range | FAIL | PASS | `GET /api/admin/billing/transactions.csv?from=YYYY-MM-DD&to=YYYY-MM-DD` (platform admins only), linked from the admin overview. |

## I. Scope of use

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| I1 | Only Gateling's own subscriptions | PASS | PASS | Only `subscribe` and `update_card` checkouts exist (`billing-checkouts-table.ts:443`). No marketplace, top-up, transfer or payout code. |
| I2 | No MOTO / staff-entered payments | PASS | PASS | Admins can grant plans by hand (`plan_grants`, `organizations.setPlan`) — no money moves; no card entry anywhere in the app. |
| I3 | Payment domain = meetings.gateling.com | PASS | PASS | Callback/return URLs derive from `BASE_URL` (`provider.ts:79-105`). **Note for Paymob:** the Vercel preview deployment also creates checkouts, with **test** keys only (memory: test keys live on the `preview` env). Declare only `meetings.gateling.com` for live keys and never put live keys on preview. |

## J. Currency & settlement

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| J1 | EGP, piasters, no ×100 bugs | PASS | PASS | Amounts are integers in piasters end-to-end (`tiers.ts:57,73`); intention `amount` = same integer; display divides by 100 once (`format-money.ts`). Card-update charge `100` = EGP 1.00. |
| J2 | Revenue reports account for Paymob fees | FAIL | PARTIAL | CSV export carries an *estimated* fee and net at the local rate (2.4% + EGP 3). Paymob's callback does not reliably say whether a card is foreign (2.6% + EGP 3), so foreign-card fees are under-estimated by 0.2%; reconcile against Paymob's settlement report, which is the source of truth (`src/features/billing/ledger.ts`). |

## K. Operational

| # | Item | Before | After | Evidence / notes |
|---|---|---|---|---|
| K1 | Failures/HMAC rejections logged (no sensitive data) and alerted | PARTIAL | PASS | Rejections `console.warn` with reason only; processing errors stored on `billing_events.error` and shown on the admin page. Added: admins are emailed on processing failures (incl. amount mismatches), callback rejections and misconfiguration — reason and ids only, throttled (`src/features/billing/server/alerts.ts`). |
| K2 | Test vs live separated; test can't run in prod | PASS | PASS | `PAYMOB_MODE` is mandatory and never defaulted; production refuses `test` unless `PAYMOB_ALLOW_TEST_IN_PRODUCTION=true` (`env/server.ts:333-356`). **Owner:** remove that opt-in when switching to live keys. |
| K3 | Payments documentation | PARTIAL | PASS | Env vars were documented in `.env.example`. Added `docs/payments.md`: flow, env vars, webhook URLs, refund procedure, incident response. |

## Summary

### Code fixes done (this branch)
See the commit list in the PR. In short: refund/void handling + amount check (A4/G3), `billing_transactions` ledger (G/H/J), receipts (D1), checkout disclosure + consent (C1/C3/E2), sign-up consent (B1), card-update charge disclosure (C1), 360-day year fix (C3), checkout rate limit (A5), admin transactions + 90-day flag + CSV export (G2/H2/J2), payment-brands component (F1), docs (A6/K3), draft legal edits.

### Verification (2026-10-02)

- `tsc --noEmit` clean; `next build` passes; `vitest run` 253/253 (new: `tests/billing-ledger.test.ts` — refund/void parsing, event ids, last-four masking, 90-day window, amount check, fee estimate, CSV quoting/formula-injection, receipt content and HTML escaping).
- Migration `0016` generated by drizzle-kit and applied cleanly to the **local** DB only. Not run on preview or production.
- Playwright: new test *the checkout dialog shows the total, renewal terms and policy links* passes locally (stops before Paymob). Screenshots checked in EN and AR (RTL).
- Sign-up consent line, `/privacy` and `/refund-policy` draft text verified on the running app; CSV export returns 403 to anonymous callers.
- `npm run lint` already fails on `main` for files this work does not touch; every file changed here passes `biome check`.
- **Not verified against real Paymob:** the refund/void callback field names (`is_refund`, `is_void`, `parent_transaction`) follow Paymob's documented callback, but no refund has been run end to end. Do one test-mode refund on preview and check it appears under Admin → Transactions with a refund email.

### Risky things found

1. **Refunds were applied as payments** (fixed): a refund on a first charge re-granted the plan; on a renewal it extended the paid period.
2. **No amount check on the payment callback** (fixed).
3. **Undisclosed EGP 1.00 card-update charge** (fixed: disclosed). Consider voiding it automatically — today it is kept.
4. **No receipts at all** (fixed, needs SMTP in production).
5. **Privacy policy let attendance records be deleted with the meeting** — your chargeback evidence. Fixed: attendance of paying orgs is kept 5 years (meetings were already only soft-deleted in code).

### Owner decisions (2026-10-02)

Legal text reviewed (DRAFT markers removed) · prices VAT-inclusive · "Cairo, Egypt" sufficient · alerting wanted (built) · backups confirmed · attendance logs kept as evidence · migrations run on every deployment · SMTP configured in production.

### Still open

1. **Re-run the refund test** after this deploy: press Re-process on the skipped event, or refund a fresh test payment.
2. **Go-live switch:** live keys on Production only, `PAYMOB_MODE=live`, remove `PAYMOB_ALLOW_TEST_IN_PRODUCTION`, re-seed the live plans, declare only `meetings.gateling.com` to Paymob.
3. **Optional:** a sign-in history with IP addresses for stronger chargeback evidence (needs a privacy-policy line).
