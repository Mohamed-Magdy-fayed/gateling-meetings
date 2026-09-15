/**
 * Seeds the Paddle catalog: one product per paid plan, each with a per-seat
 * monthly and annual price, plus regional overrides. Idempotent by product
 * name — re-running skips products that already exist. Launch pricing is in
 * README.md; change amounts in Paddle afterwards, not here (the pricing page
 * reads the catalog).
 *
 *   PADDLE_API_KEY=pdl_sdbx_... npx tsx scripts/seed-paddle-catalog.ts
 *   PADDLE_API_KEY=pdl_live_... PADDLE_ENVIRONMENT=production npx tsx scripts/seed-paddle-catalog.ts
 */
import {
  type CountryCode,
  type CreatePriceRequestBody,
  type CurrencyCode,
  Environment,
  Paddle,
} from "@paddle/paddle-node-sdk";

const EUROZONE: CountryCode[] = [
  "IE",
  "DE",
  "FR",
  "ES",
  "IT",
  "NL",
  "BE",
  "AT",
  "PT",
  "FI",
];

type Override = {
  countryCodes: CountryCode[];
  currencyCode: CurrencyCode;
  monthly: string;
  annual: string;
};

type Plan = {
  name: string;
  description: string;
  monthly: string;
  annual: string;
  overrides: Override[];
};

// Amounts are strings in the lowest unit ("300" = USD 3.00), per seat.
// Paddle has no EGP, so Egypt is a lower USD amount rather than a currency swap.
const PLANS: Plan[] = [
  {
    name: "Pro",
    description:
      "Up to 50 participants, 24-hour meetings, unlimited scheduling, breakout rooms. Billed per seat.",
    monthly: "300",
    annual: "3000",
    overrides: [
      {
        countryCodes: ["GB"],
        currencyCode: "GBP",
        monthly: "250",
        annual: "2500",
      },
      {
        countryCodes: EUROZONE,
        currencyCode: "EUR",
        monthly: "280",
        annual: "2800",
      },
      {
        countryCodes: ["AU"],
        currencyCode: "AUD",
        monthly: "450",
        annual: "4500",
      },
      {
        countryCodes: ["CA"],
        currencyCode: "CAD",
        monthly: "400",
        annual: "4000",
      },
      {
        countryCodes: ["IN"],
        currencyCode: "INR",
        monthly: "15000",
        annual: "150000",
      },
      {
        countryCodes: ["EG"],
        currencyCode: "USD",
        monthly: "200",
        annual: "2000",
      },
    ],
  },
  {
    name: "Business",
    description:
      "Up to 200 participants, breakout rooms, API access and integrations. Billed per seat.",
    monthly: "600",
    annual: "6000",
    overrides: [
      {
        countryCodes: ["GB"],
        currencyCode: "GBP",
        monthly: "500",
        annual: "5000",
      },
      {
        countryCodes: EUROZONE,
        currencyCode: "EUR",
        monthly: "560",
        annual: "5600",
      },
      {
        countryCodes: ["AU"],
        currencyCode: "AUD",
        monthly: "900",
        annual: "9000",
      },
      {
        countryCodes: ["CA"],
        currencyCode: "CAD",
        monthly: "800",
        annual: "8000",
      },
      {
        countryCodes: ["IN"],
        currencyCode: "INR",
        monthly: "30000",
        annual: "300000",
      },
      {
        countryCodes: ["EG"],
        currencyCode: "USD",
        monthly: "400",
        annual: "4000",
      },
    ],
  },
];

const SEAT_QUANTITY = { minimum: 1, maximum: 500 };

function priceBody(
  plan: Plan,
  productId: string,
  interval: "month" | "year",
): CreatePriceRequestBody {
  const key = interval === "month" ? "monthly" : "annual";
  return {
    productId,
    name: `${plan.name} ${key} (per seat)`,
    description: `${plan.name} ${key} USD, per seat`,
    unitPrice: { amount: plan[key], currencyCode: "USD" },
    billingCycle: { interval, frequency: 1 },
    quantity: SEAT_QUANTITY,
    unitPriceOverrides: plan.overrides.map((o) => ({
      countryCodes: o.countryCodes,
      unitPrice: { amount: o[key], currencyCode: o.currencyCode },
    })),
  };
}

async function main() {
  const apiKey = process.env.PADDLE_API_KEY;
  if (!apiKey) throw new Error("PADDLE_API_KEY is not set");
  const environment =
    process.env.PADDLE_ENVIRONMENT === "production"
      ? Environment.production
      : Environment.sandbox;
  const paddle = new Paddle(apiKey, { environment });

  const existing = new Map<string, string>();
  for await (const product of paddle.products.list({ status: ["active"] })) {
    existing.set(product.name, product.id);
  }

  const created: Record<string, unknown>[] = [];
  for (const plan of PLANS) {
    if (existing.has(plan.name)) {
      console.log(
        `skip ${plan.name}: already exists as ${existing.get(plan.name)}`,
      );
      continue;
    }
    const product = await paddle.products.create({
      name: plan.name,
      taxCategory: "saas",
      description: plan.description,
    });
    const monthly = await paddle.prices.create(
      priceBody(plan, product.id, "month"),
    );
    const annual = await paddle.prices.create(
      priceBody(plan, product.id, "year"),
    );
    created.push({
      plan: plan.name,
      productId: product.id,
      monthlyPriceId: monthly.id,
      annualPriceId: annual.id,
    });
  }
  console.log(JSON.stringify({ environment, created }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
