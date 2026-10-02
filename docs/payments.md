# Payments (Paymob)

How money moves through Gateling Meetings, and what to do when something
goes wrong. Compliance status against the merchant agreement lives in
[`paymob-compliance-audit.md`](./paymob-compliance-audit.md).

## Flow

1. **Checkout** — an org owner/admin picks a plan, interval and seats on
   `/pricing` or Settings → Billing. The dialog shows the total, the
   renewal terms and the policy links. `billing.createCheckout`
   (rate-limited, 10 per user per 10 min):
   - computes the amount server-side from `src/features/billing/tiers.ts`
     (piastres; the browser never sends an amount),
   - writes a `billing_checkouts` row (the org binding for every callback),
   - creates a Paymob **intention** bound to the plan's Paymob
     subscription plan, and redirects the browser to Paymob's hosted
     unified checkout. Card details are entered only there.
2. **Callback** — Paymob posts the HMAC-signed *transaction processed*
   callback to `/api/billing/webhook/paymob/transaction`. The route
   verifies the HMAC (401 otherwise), stores the event once in
   `billing_events` (unique on the provider event id) and hands it to
   Inngest.
3. **Processing** (`on-billing-webhook`):
   - every payment, refund and void is written to `billing_transactions`
     (the ledger: brand + last four only, never a PAN);
   - an initial payment whose amount/currency differs from the checkout is
     recorded and **not** granted (event marked `error`);
   - a successful payment grants/extends the plan; a refund or void is
     recorded against its payment and never grants anything;
   - a bilingual receipt is emailed for every successful payment,
     renewal, refund and void (`receipt_sent_at` marks it sent).
4. **Renewals** — Paymob charges the saved card every 30 / 360 days and
   sends the same transaction callback; the plan-level subscription
   webhook (`/api/billing/webhook/paymob/subscription/<token>`, unsigned)
   only triggers a re-read of the subscription from Paymob's API.
5. **Return** — the browser lands on `/welcome`, which never grants
   anything; it only greets.

## Environment

See `.env.example` for the full list and how to obtain each value:
`BILLING_PROVIDER`, `PAYMOB_API_KEY`, `PAYMOB_SECRET_KEY`,
`PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_MODE`,
`PAYMOB_CARD_INTEGRATION_ID`, `PAYMOB_PLAN_ID_{PRO,BUSINESS}_{MONTH,YEAR}`,
`PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN`, and (temporarily)
`PAYMOB_ALLOW_TEST_IN_PRODUCTION`.

- All are server-only; none may ever be `NEXT_PUBLIC_*`.
- Test and live keys live in different Vercel environments. **Live keys
  only on Production; Preview keeps test keys.**
- `PAYMOB_MODE` is never defaulted; production refuses `test` unless
  `PAYMOB_ALLOW_TEST_IN_PRODUCTION=true`. Remove that variable when you
  switch to live keys.

## URLs to register in the Paymob dashboard

| What | URL |
|---|---|
| Transaction processed callback | `https://meetings.gateling.com/api/billing/webhook/paymob/transaction` |
| Subscription plan webhook | `https://meetings.gateling.com/api/billing/webhook/paymob/subscription/<PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN>` (set by `scripts/seed-paymob-plans.ts`) |
| Declared website / payment domain | `meetings.gateling.com` only |

## Refund procedure

Refunds go **only** back to the original card, **only** through Paymob,
and **only within 90 days** of the charge. Never refund in cash, by bank
transfer or to another card.

1. Find the payment: Admin → Transactions (or the org's admin page). It
   shows the Paymob transaction id, card brand + last four, what has
   already been refunded, and the refund deadline — flagged red once the
   90 days have passed (Paymob will reject it then).
2. Check the request against the [Refund & Cancellation
   Policy](../src/features/legal/content/refunds.ts).
3. Refund in the **Paymob dashboard** → Transactions → the transaction id
   → Refund (full or partial amount).
4. Paymob sends a refund callback; the app records it in the ledger
   against the payment and emails the customer a refund confirmation.
   Check it appears under Admin → Transactions.
5. Refunding does **not** cancel the subscription. If the refund ends the
   relationship, cancel it too (Settings → Billing → Cancel as the org's
   admin, or in the Paymob dashboard) so the card is not charged again.

## Records and exports

- `billing_transactions`, `billing_events` and `billing_checkouts` are the
  record; nothing deletes them. Keep **at least 5 years** (agreement
  4.21; 4.25 requires 18 months). Database backups must not be the only
  copy older than their retention window.
- Admin → Transactions → *Export (CSV)* downloads a date range with
  estimated Paymob fees (2.4% + EGP 3 local) and net — for Paymob
  inspection requests and settlement reconciliation. Paymob's settlement
  report is the source of truth for actual fees (foreign cards are
  2.6% + EGP 3).

## Monitoring

- Rejected callbacks log `[billing:paymob] rejected ... webhook <reason>`
  (no payload). Processing failures are stored on `billing_events.error`
  and shown on the org's admin page.
- Amount mismatches log `[billing] checkout ... charged ... expected ...`.
- **To do (owner):** add a Vercel log alert on `[billing` warnings/errors
  and enable Inngest failure notifications for `on-billing-webhook`.

## Incident response

> DRAFT – needs owner review (contact details and timings).

A suspected or confirmed leak of payment data or credentials — e.g. a
Paymob key in a commit, a log or a screenshot; unexpected admin access;
callbacks with a valid HMAC that we did not cause:

1. **Notify Paymob immediately** — the merchant agreement (3.2.8, 4.20)
   requires it. Owner: Mohamed Magdy Fayed, info@gateling.com. Use
   Paymob's merchant support channel and your account manager; keep a
   written record of when and to whom.
2. **Rotate** the affected keys in the Paymob dashboard (API key, secret
   key, HMAC secret), update them in Vercel, and redeploy. Rotate
   `PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN` too (re-run the seed script so the
   plans point at the new URL).
3. **Contain** — set `BILLING_PROVIDER` empty on Production to stop new
   checkouts while you investigate. Callbacks for payments already in
   flight are still verified and recorded (with the new HMAC secret once
   rotated).
4. **Assess** — review `billing_events` / `billing_transactions` and Vercel
   logs for the window; the app never holds card numbers, so the exposure
   is keys, customer names/emails/phones and transaction metadata.
5. **Notify affected customers** where personal data was exposed, as
   Egypt's PDPL (151/2020) requires.
