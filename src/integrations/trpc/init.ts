import { initTRPC, TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import superjson from "superjson";
import z, { ZodError } from "zod";

import { db } from "@/drizzle";
import type {
  Organization,
  OrganizationMembership,
  OrganizationRole,
} from "@/drizzle/schema";
import {
  entitlementErrorData,
  type ResolvedEntitlements,
  resolveEntitlements,
} from "@/features/billing/plans";
import {
  getUserSession,
  setSessionOrganization,
} from "@/features/core/auth/core";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { LOCALE_COOKIE_NAME } from "@/features/core/i18n/lib";
import { getT } from "@/features/core/i18n/server";
import {
  ensurePersonalOrganization,
  loadActiveOrganization,
} from "@/features/organizations/server/service";
import { handleDatabaseError } from "./db-error";

export const createTRPCContext = async () => {
  const cookieStore = await cookies();
  const session = await getUserSession(cookieStore);
  const { t } = await getT();
  const locale = cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? "en";

  return { session, cookies: cookieStore, t, db, locale };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? z.treeifyError(error.cause) : null,
        // Lets the client show an "Upgrade" call to action keyed on what
        // ran out, without parsing the translated message.
        entitlement: entitlementErrorData(error.cause),
      },
    };
  },
});

const authMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({ ctx: { session: ctx.session } });
});

const adminMiddleware = t.middleware(({ ctx, next }) => {
  if (!ctx.session || !isAdminEmail(ctx.session.user.email)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next({ ctx: { session: ctx.session } });
});

/**
 * Resolves the session's active organization (one joined query) and what
 * it is entitled to. Sessions from before organizations existed carry no
 * `orgId`; they get their personal org and the session is healed in place.
 */
const orgMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  const { session } = ctx;

  let active = await loadActiveOrganization(
    ctx.db,
    session.user.id,
    session.orgId ?? null,
  );
  if (!active) {
    await ensurePersonalOrganization(ctx.db, session.user);
    active = await loadActiveOrganization(ctx.db, session.user.id, null);
  }
  if (!active) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  if (session.orgId !== active.organization.id) {
    await setSessionOrganization(active.organization.id, ctx.cookies);
  }

  const isAdmin = isAdminEmail(session.user.email);
  return next({
    ctx: {
      session,
      organization: active.organization,
      membership: active.membership,
      isAdmin,
      entitlements: resolveEntitlements(active.organization, { isAdmin }),
    },
  });
});

const orgRoleMiddleware = (roles: readonly OrganizationRole[]) =>
  t.middleware(({ ctx, next }) => {
    const { isAdmin, membership } = ctx as OrgContext;
    if (!isAdmin && !roles.includes(membership.role)) {
      throw new TRPCError({ code: "FORBIDDEN" });
    }
    return next();
  });

const databaseErrorMiddleware = t.middleware(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw handleDatabaseError(err);
  }
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;

/** Anyone — including meeting guests who never sign in. */
export const publicProcedure = t.procedure.use(databaseErrorMiddleware);

/** Requires a signed-in account (a meeting host). */
export const protectedProcedure = t.procedure
  .use(authMiddleware)
  .use(databaseErrorMiddleware);

/** A signed-in member of the session's active organization. */
export const orgProcedure = t.procedure
  .use(authMiddleware)
  .use(orgMiddleware)
  .use(databaseErrorMiddleware);

/** An owner or admin of the active organization (platform admins pass). */
export const orgAdminProcedure = t.procedure
  .use(authMiddleware)
  .use(orgMiddleware)
  .use(orgRoleMiddleware(["owner", "admin"]))
  .use(databaseErrorMiddleware);

/** An account listed in `ADMIN_EMAILS` — runs the platform. */
export const adminProcedure = t.procedure
  .use(adminMiddleware)
  .use(databaseErrorMiddleware);

export type OrgContext = TRPCContext & {
  session: NonNullable<TRPCContext["session"]>;
  organization: Organization;
  membership: OrganizationMembership;
  isAdmin: boolean;
  entitlements: ResolvedEntitlements;
};
