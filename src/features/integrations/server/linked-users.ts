import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";

import type { Database } from "@/drizzle";
import {
  type Integration,
  LinkedUsersTable,
  type User,
  UsersTable,
} from "@/drizzle/schema";
import { normalizeEmail } from "@/features/core/auth/core/helpers";
import { createPersonalOrganization } from "@/features/organizations/server/service";

export type ExternalUser = {
  externalId: string;
  name: string;
  email?: string | null;
};

type LinkedUserResult = Pick<User, "id" | "email" | "name" | "emailVerifiedAt">;

const userColumns = {
  id: true,
  email: true,
  name: true,
  emailVerifiedAt: true,
} as const;

/**
 * Finds — or creates on first sight — the `users` row for a person from
 * another system. The row is marked verified because that system vouched
 * for them; that is what lets a host link become a normal session.
 *
 * One deliberate limit: an integration is never linked to a *pre-existing*
 * account by email. If `alice@x.com` already signed up here, an integration
 * claiming `alice@x.com` gets a fresh account with a placeholder address
 * instead. Otherwise a leaked API key would mint a session as any native
 * user — including an admin — just by knowing their email.
 */
export async function ensureLinkedUser(
  db: Database,
  integration: Pick<Integration, "id" | "slug">,
  person: ExternalUser,
  attempt = 0,
): Promise<LinkedUserResult> {
  const existing = await findLinkedUser(db, integration.id, person.externalId);
  if (existing) {
    if (person.name && person.name !== existing.name) {
      await db
        .update(UsersTable)
        .set({
          name: person.name,
          updatedBy: `integration:${integration.slug}`,
        })
        .where(eq(UsersTable.id, existing.id));
    }
    await db
      .update(LinkedUsersTable)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(LinkedUsersTable.integrationId, integration.id),
          eq(LinkedUsersTable.externalId, person.externalId),
        ),
      );
    return { ...existing, name: person.name || existing.name };
  }

  const email = await pickEmail(db, integration.slug, person);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(UsersTable)
        .values({
          email,
          name: person.name,
          emailVerifiedAt: new Date(),
          createdBy: `integration:${integration.slug}`,
        })
        .returning({
          id: UsersTable.id,
          email: UsersTable.email,
          name: UsersTable.name,
          emailVerifiedAt: UsersTable.emailVerifiedAt,
        });
      if (!user) throw new Error("user insert returned no row");
      await tx.insert(LinkedUsersTable).values({
        integrationId: integration.id,
        externalId: person.externalId,
        userId: user.id,
      });
      await createPersonalOrganization(
        tx,
        user,
        `integration:${integration.slug}`,
      );
      return user;
    });
  } catch (error) {
    // Two requests for the same new person at once: the loser's insert hits
    // the primary key, so it simply reads what the winner wrote.
    const raced = await findLinkedUser(db, integration.id, person.externalId);
    if (raced) return raced;
    // Two *different* people claiming the same real email at once: the
    // loser's user insert hits the email index. Going round once more sees
    // the address as taken and falls back to the placeholder.
    if (isUniqueViolation(error) && attempt === 0) {
      return ensureLinkedUser(db, integration, person, attempt + 1);
    }
    throw error;
  }
}

/** Postgres `unique_violation`; postgres-js surfaces the SQLSTATE as `code`. */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

async function findLinkedUser(
  db: Database,
  integrationId: string,
  externalId: string,
) {
  const link = await db.query.LinkedUsersTable.findFirst({
    where: and(
      eq(LinkedUsersTable.integrationId, integrationId),
      eq(LinkedUsersTable.externalId, externalId),
    ),
    with: { user: { columns: userColumns } },
  });
  return link?.user ?? null;
}

/**
 * The person's real address when it is free; otherwise a placeholder on a
 * reserved TLD (RFC 2606) that can never route mail. Hashed rather than
 * embedding the external id, which may be a private identifier.
 */
async function pickEmail(
  db: Database,
  slug: string,
  person: ExternalUser,
): Promise<string> {
  if (person.email) {
    const candidate = normalizeEmail(person.email);
    const taken = await db.query.UsersTable.findFirst({
      where: eq(UsersTable.email, candidate),
      columns: { id: true },
    });
    if (!taken) return candidate;
  }
  const digest = crypto
    .createHash("sha256")
    .update(`${slug}:${person.externalId}`)
    .digest("hex")
    .slice(0, 24);
  return `linked-${digest}@${slug}.invalid`;
}
