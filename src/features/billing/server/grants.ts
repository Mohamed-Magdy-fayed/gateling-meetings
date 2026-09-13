import { and, desc, eq, isNull } from "drizzle-orm";

import type { DatabaseOrTransaction } from "@/drizzle";
import {
  type Organization,
  OrganizationsTable,
  type PlanGrant,
  PlanGrantsTable,
} from "@/drizzle/schema";
import { normalizeEmail } from "@/features/core/auth/core/helpers";

type GrantCandidate = Pick<
  PlanGrant,
  "id" | "email" | "expiresAt" | "consumedAt" | "createdAt"
>;

/**
 * Picks the grant that applies to `email`, if any: unconsumed, not expired,
 * newest first. Pure so the matching rules are unit-tested without a DB.
 */
export function matchPlanGrant<G extends GrantCandidate>(
  grants: readonly G[],
  email: string,
  now: Date = new Date(),
): G | null {
  const wanted = normalizeEmail(email);
  const live = grants
    .filter((grant) => normalizeEmail(grant.email) === wanted)
    .filter((grant) => grant.consumedAt == null)
    .filter(
      (grant) =>
        grant.expiresAt == null || grant.expiresAt.getTime() > now.getTime(),
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return live[0] ?? null;
}

/**
 * Applies a pending grant for `email` to `org` and marks it consumed. Runs
 * inside the caller's transaction so a sign-up either gets its comped plan
 * or is rolled back whole. Returns the org as it now stands.
 */
export async function applyPlanGrant(
  db: DatabaseOrTransaction,
  org: Organization,
  email: string | null | undefined,
): Promise<Organization> {
  if (!email) return org;
  const candidates = await db
    .select()
    .from(PlanGrantsTable)
    .where(
      and(
        eq(PlanGrantsTable.email, normalizeEmail(email)),
        isNull(PlanGrantsTable.consumedAt),
      ),
    )
    .orderBy(desc(PlanGrantsTable.createdAt))
    .for("update");
  const grant = matchPlanGrant(candidates, email);
  if (!grant) return org;

  const now = new Date();
  const [updated] = await db
    .update(OrganizationsTable)
    .set({
      plan: grant.plan,
      planSource: "manual",
      planExpiresAt: grant.expiresAt,
      planNote: grant.note,
      seatLimit: grant.seatLimit,
      updatedBy: `grant:${grant.id}`,
    })
    .where(eq(OrganizationsTable.id, org.id))
    .returning();
  await db
    .update(PlanGrantsTable)
    .set({ consumedAt: now, consumedByOrganizationId: org.id })
    .where(eq(PlanGrantsTable.id, grant.id));
  return updated ?? org;
}
