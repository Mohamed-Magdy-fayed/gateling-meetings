import { and, asc, eq, gte, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";

import { db } from "@/drizzle";
import { BillingTransactionsTable, OrganizationsTable } from "@/drizzle/schema";
import { ledgerToCsv } from "@/features/billing/ledger";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getUserSession } from "@/features/core/auth/core/session";

/** One file is a reconciliation, not a backup; ask for a shorter range past this. */
const MAX_ROWS = 50_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const rangeSchema = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
  })
  .refine(({ from, to }) => from <= to, { message: "from must be <= to" });

/**
 * `GET /api/admin/billing/transactions?from=YYYY-MM-DD&to=YYYY-MM-DD` —
 * every recorded payment, refund and void in the range (UTC days, `to`
 * inclusive) as CSV, for Paymob inspection requests and settlement
 * reconciliation. Platform admins only.
 */
export async function GET(request: Request): Promise<Response> {
  const session = await getUserSession(await cookies());
  if (!session || !isAdminEmail(session.user.email)) {
    return new Response("forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = rangeSchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!parsed.success) {
    return new Response("from and to must be YYYY-MM-DD dates, from <= to", {
      status: 400,
    });
  }
  const { from, to } = parsed.data;
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(new Date(`${to}T00:00:00Z`).getTime() + DAY_MS);

  const rows = await db
    .select({
      occurredAt: BillingTransactionsTable.occurredAt,
      providerTransactionId: BillingTransactionsTable.providerTransactionId,
      kind: BillingTransactionsTable.kind,
      status: BillingTransactionsTable.status,
      parentTransactionId: BillingTransactionsTable.parentTransactionId,
      organizationId: BillingTransactionsTable.organizationId,
      organizationName: OrganizationsTable.name,
      customerEmail: BillingTransactionsTable.customerEmail,
      plan: BillingTransactionsTable.plan,
      interval: BillingTransactionsTable.interval,
      seats: BillingTransactionsTable.seats,
      amountCents: BillingTransactionsTable.amountCents,
      currency: BillingTransactionsTable.currency,
      refundedAmountCents: BillingTransactionsTable.refundedAmountCents,
      cardBrand: BillingTransactionsTable.cardBrand,
      cardLast4: BillingTransactionsTable.cardLast4,
    })
    .from(BillingTransactionsTable)
    .leftJoin(
      OrganizationsTable,
      eq(OrganizationsTable.id, BillingTransactionsTable.organizationId),
    )
    .where(
      and(
        gte(BillingTransactionsTable.occurredAt, start),
        lt(BillingTransactionsTable.occurredAt, end),
      ),
    )
    .orderBy(asc(BillingTransactionsTable.occurredAt))
    .limit(MAX_ROWS + 1);

  if (rows.length > MAX_ROWS) {
    return new Response(
      `more than ${MAX_ROWS} transactions in range; export a shorter range`,
      { status: 422 },
    );
  }

  return new Response(ledgerToCsv(rows), {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="gateling-transactions-${from}_${to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
