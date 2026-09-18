/**
 * Creates the four Paymob subscription plans the app bills on — one per
 * paid tier and billing interval — and prints the env lines to paste.
 * Idempotent: a plan with the expected name, webhook URL and frequency is
 * reported, not duplicated. Paymob plans are write-once — PUT/PATCH answer
 * 200 and change nothing, DELETE answers "Can't delete plans" — so one that
 * is wrong (a run against the local BASE_URL is the usual cause) is left
 * behind and a correct one is created under the next "#n" name; deactivate
 * the stale one in the dashboard. Amounts come from
 * `tiers.ts` but the plans are created with
 * `use_transaction_amount`, so what Paymob charges each cycle is whatever
 * the checkout put on the first payment (seats × unit price) — the plan
 * amount here is the single-seat price and only a label.
 *
 *   PAYMOB_API_KEY=… PAYMOB_CARD_INTEGRATION_ID=… BASE_URL=https://… \
 *   PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN=… npx tsx scripts/seed-paymob-plans.ts
 *
 * Run once against the test keys (webhook → the preview deployment) and
 * once against the live keys (webhook → production); the ids differ.
 */
import dotenv from "dotenv";

dotenv.config();

import {
  BILLING_INTERVALS,
  TIER_DEFINITIONS,
} from "../src/features/billing/tiers";

const BASE = "https://accept.paymob.com";
/**
 * Paymob's `frequency` is a fixed choice list, not free-form days
 * (OPTIONS on the endpoint): 0 one-time, 1 daily, 7 weekly, 15 biweekly,
 * 30 monthly, 60 bimonthly, 90 quarterly, 180 half-annual, 360 yearly.
 * So a "year" bills every 360 days — the app never assumes 365; the period
 * end is whatever `next_billing` Paymob reports.
 */
const FREQUENCY_DAYS = { month: 30, year: 360 } as const;
/** Days before a due deduction Paymob reminds the customer, and retries a failed one. */
const REMINDER_DAYS = 3;
const RETRIAL_DAYS = 3;

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function bearer(apiKey: string): Promise<string> {
  const response = await fetch(`${BASE}/api/auth/tokens`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ api_key: apiKey }),
  });
  if (!response.ok)
    throw new Error(`auth ${response.status}: ${await response.text()}`);
  const { token } = (await response.json()) as { token: string };
  return token;
}

type Plan = {
  id: number | string;
  name: string;
  frequency?: number;
  webhook_url?: string | null;
};

async function listPlans(token: string): Promise<Plan[]> {
  const response = await fetch(`${BASE}/api/acceptance/subscription-plans`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok)
    throw new Error(`list ${response.status}: ${await response.text()}`);
  const body = (await response.json()) as Plan[] | { results: Plan[] };
  return Array.isArray(body) ? body : body.results;
}

async function createPlan(
  token: string,
  body: Record<string, unknown>,
): Promise<Plan> {
  const response = await fetch(`${BASE}/api/acceptance/subscription-plans`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`create ${response.status}: ${await response.text()}`);
  return (await response.json()) as Plan;
}

async function main() {
  const apiKey = required("PAYMOB_API_KEY");
  const integration = Number(required("PAYMOB_CARD_INTEGRATION_ID"));
  const baseUrl = required("BASE_URL");
  const webhookToken = required("PAYMOB_SUBSCRIPTION_WEBHOOK_TOKEN");
  const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

  // Paymob posts the webhook from its side, so a plan created with the local
  // .env's localhost BASE_URL is silently dead. Point BASE_URL at the
  // deployment the plans are for before running.
  if (!baseUrl.startsWith("https://")) {
    throw new Error(
      `BASE_URL must be the public https URL of the deployment these plans belong to, got ${baseUrl}`,
    );
  }

  const webhookUrl = new URL(
    `/api/billing/webhook/paymob/subscription/${webhookToken}`,
    baseUrl,
  );
  if (bypass) webhookUrl.searchParams.set("x-vercel-protection-bypass", bypass);

  const token = await bearer(apiKey);
  const existing = await listPlans(token);
  const envLines: string[] = [];

  for (const tier of TIER_DEFINITIONS) {
    for (const interval of BILLING_INTERVALS) {
      const name = `Gateling Meetings ${tier.name} (${interval}ly, per seat)`;
      const envName = `PAYMOB_PLAN_ID_${tier.name.toUpperCase()}_${interval.toUpperCase()}`;
      // "<name>", "<name> #2", "<name> #3", … — every earlier attempt.
      const attempts = existing.filter(
        (plan) => plan.name === name || plan.name.startsWith(`${name} #`),
      );
      const found = attempts.find(
        (plan) =>
          plan.webhook_url === webhookUrl.toString() &&
          plan.frequency === FREQUENCY_DAYS[interval],
      );
      if (found) {
        console.log(`exists  ${found.name} → ${found.id}`);
        envLines.push(`${envName}="${found.id}"`);
        continue;
      }
      for (const stale of attempts) {
        console.warn(
          `  ! ${stale.name} (${stale.id}) has the wrong webhook url or frequency and cannot be changed or deleted via the API — deactivate it in the Paymob dashboard`,
        );
      }
      const created = await createPlan(token, {
        name: attempts.length ? `${name} #${attempts.length + 1}` : name,
        frequency: FREQUENCY_DAYS[interval],
        reminder_days: REMINDER_DAYS,
        retrial_days: RETRIAL_DAYS,
        plan_type: "rent",
        number_of_deductions: null,
        amount_cents: tier.unitAmountCents[interval],
        use_transaction_amount: true,
        is_active: true,
        integration,
        webhook_url: webhookUrl.toString(),
      });
      console.log(`created ${created.name} → ${created.id}`);
      envLines.push(`${envName}="${created.id}"`);
    }
  }

  console.log("\nAdd to the environment:\n");
  console.log(envLines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
