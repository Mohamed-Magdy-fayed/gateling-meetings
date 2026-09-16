/**
 * Creates the four Paymob subscription plans the app bills on — one per
 * paid tier and billing interval — and prints the env lines to paste.
 * Idempotent by name: a plan that already exists is reported, not
 * duplicated. Amounts come from `tiers.ts` but the plans are created with
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
import {
  BILLING_INTERVALS,
  TIER_DEFINITIONS,
} from "../src/features/billing/tiers";

const BASE = "https://accept.paymob.com";
const FREQUENCY_DAYS = { month: 30, year: 365 } as const;
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

type Plan = { id: number | string; name: string };

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
      const found = existing.find((plan) => plan.name === name);
      if (found) {
        console.log(`exists  ${name} → ${found.id}`);
        envLines.push(`${envName}="${found.id}"`);
        continue;
      }
      const created = await createPlan(token, {
        name,
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
      console.log(`created ${name} → ${created.id}`);
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
