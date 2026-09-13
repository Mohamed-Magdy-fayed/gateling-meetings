import { and, eq, isNull } from "drizzle-orm";

import type { Database, DatabaseOrTransaction } from "@/drizzle";
import {
  type Organization,
  type OrganizationMembership,
  OrganizationMembershipsTable,
  OrganizationsTable,
} from "@/drizzle/schema";
import { applyPlanGrant } from "@/features/billing/server/grants";

export type OrganizationUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type ActiveOrganization = {
  organization: Organization;
  membership: OrganizationMembership;
};

function personalOrganizationName(user: OrganizationUser): string {
  const fromName = user.name?.trim();
  if (fromName) return fromName.slice(0, 128);
  const local = user.email?.split("@")[0]?.trim();
  return (local || "Personal").slice(0, 128);
}

/**
 * The org every account gets on first sign-in. Created inside the caller's
 * transaction (sign-up, OAuth, integration link) so a user row never exists
 * without one; a pending plan grant for the email is applied here, which is
 * how a partner can be comped before they ever sign up.
 */
export async function createPersonalOrganization(
  db: DatabaseOrTransaction,
  user: OrganizationUser,
  actorId: string,
): Promise<Organization> {
  const [created] = await db
    .insert(OrganizationsTable)
    .values({
      name: personalOrganizationName(user),
      personalOwnerId: user.id,
      createdBy: actorId,
    })
    .returning();
  if (!created) throw new Error("organization insert returned no row");
  await db.insert(OrganizationMembershipsTable).values({
    organizationId: created.id,
    userId: user.id,
    role: "owner",
    createdBy: actorId,
  });
  return applyPlanGrant(db, created, user.email);
}

export async function findPersonalOrganization(
  db: DatabaseOrTransaction,
  userId: string,
): Promise<Organization | null> {
  const org = await db.query.OrganizationsTable.findFirst({
    where: and(
      eq(OrganizationsTable.personalOwnerId, userId),
      isNull(OrganizationsTable.deletedAt),
    ),
  });
  return org ?? null;
}

/**
 * Safety net for accounts that predate organizations or slipped in between
 * a deploy and its migration: finds the personal org, creating it if
 * missing. Two concurrent first requests race on the unique owner index;
 * the loser simply reads what the winner wrote.
 */
export async function ensurePersonalOrganization(
  db: Database,
  user: OrganizationUser,
): Promise<Organization> {
  const existing = await findPersonalOrganization(db, user.id);
  if (existing) return existing;
  try {
    return await db.transaction((trx) =>
      createPersonalOrganization(trx, user, user.id),
    );
  } catch (error) {
    const raced = await findPersonalOrganization(db, user.id);
    if (raced) return raced;
    throw error;
  }
}

/**
 * One query: the org the session points at, provided the user is still a
 * member of it. With no `orgId` (legacy session) or a stale one (removed
 * from the org), the personal org is the answer and the caller heals the
 * session.
 */
export async function loadActiveOrganization(
  db: DatabaseOrTransaction,
  userId: string,
  orgId: string | null,
): Promise<ActiveOrganization | null> {
  const select = (where: ReturnType<typeof and>) =>
    db
      .select({
        organization: OrganizationsTable,
        membership: OrganizationMembershipsTable,
      })
      .from(OrganizationMembershipsTable)
      .innerJoin(
        OrganizationsTable,
        eq(OrganizationsTable.id, OrganizationMembershipsTable.organizationId),
      )
      .where(where)
      .limit(1);

  const base = and(
    eq(OrganizationMembershipsTable.userId, userId),
    isNull(OrganizationsTable.deletedAt),
  );

  if (orgId) {
    const [row] = await select(and(base, eq(OrganizationsTable.id, orgId)));
    if (row) return row;
  }
  const [personal] = await select(
    and(base, eq(OrganizationsTable.personalOwnerId, userId)),
  );
  return personal ?? null;
}

export async function listUserOrganizations(
  db: DatabaseOrTransaction,
  userId: string,
): Promise<ActiveOrganization[]> {
  return db
    .select({
      organization: OrganizationsTable,
      membership: OrganizationMembershipsTable,
    })
    .from(OrganizationMembershipsTable)
    .innerJoin(
      OrganizationsTable,
      eq(OrganizationsTable.id, OrganizationMembershipsTable.organizationId),
    )
    .where(
      and(
        eq(OrganizationMembershipsTable.userId, userId),
        isNull(OrganizationsTable.deletedAt),
      ),
    )
    .orderBy(OrganizationsTable.createdAt);
}
