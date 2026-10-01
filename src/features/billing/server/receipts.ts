import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Database } from "@/drizzle";
import { BillingTransactionsTable, OrganizationsTable } from "@/drizzle/schema";
import { isMailConfigured, sendMail } from "@/integrations/email";
import { buildReceiptEmail } from "../receipt-content";

/**
 * Sends the receipt for every successful transaction an event recorded
 * that has not had one yet. Each row is claimed (`receipt_sent_at` set)
 * before the email goes out and released again if sending fails, so a
 * retried step neither skips a receipt nor sends one twice.
 *
 * With SMTP not configured nothing is claimed: the rows keep
 * `receipt_sent_at` null, so it is visible which payments never got one.
 */
export async function sendReceiptsForEvent(
  db: Database,
  billingEventId: string,
): Promise<{ sent: number }> {
  if (!isMailConfigured()) {
    console.warn("[billing] SMTP not configured; receipts not sent");
    return { sent: 0 };
  }
  const claimed = await db
    .update(BillingTransactionsTable)
    .set({ receiptSentAt: new Date() })
    .where(
      and(
        eq(BillingTransactionsTable.billingEventId, billingEventId),
        eq(BillingTransactionsTable.status, "succeeded"),
        isNull(BillingTransactionsTable.receiptSentAt),
      ),
    )
    .returning();

  const recipients = claimed.filter((tx) => tx.customerEmail);
  const orgIds = [
    ...new Set(recipients.map((tx) => tx.organizationId).filter(Boolean)),
  ] as string[];
  const orgs = orgIds.length
    ? await db
        .select({ id: OrganizationsTable.id, name: OrganizationsTable.name })
        .from(OrganizationsTable)
        .where(inArray(OrganizationsTable.id, orgIds))
    : [];
  const orgName = new Map(orgs.map((org) => [org.id, org.name]));

  let sent = 0;
  for (const [index, tx] of claimed.entries()) {
    if (!tx.customerEmail) {
      console.warn(
        `[billing] no receipt address for transaction ${tx.providerTransactionId}`,
      );
      continue;
    }
    const email = buildReceiptEmail({
      ...tx,
      organizationName: tx.organizationId
        ? (orgName.get(tx.organizationId) ?? null)
        : null,
    });
    try {
      await sendMail({
        toEmail: tx.customerEmail,
        subject: email.subject,
        text: email.text,
        html: email.html,
        fromName: "Gateling",
      });
      sent += 1;
    } catch (error) {
      // Release this row and every one not reached yet; the step retries.
      const unsent = claimed.slice(index).map((row) => row.id);
      await db
        .update(BillingTransactionsTable)
        .set({ receiptSentAt: null })
        .where(inArray(BillingTransactionsTable.id, unsent));
      throw error;
    }
  }
  return { sent };
}
