import { initTRPC, TRPCError } from "@trpc/server";
import { cookies } from "next/headers";
import superjson from "superjson";
import z, { ZodError } from "zod";

import { db } from "@/drizzle";
import { getUserSession } from "@/features/core/auth/core";
import { LOCALE_COOKIE_NAME } from "@/features/core/i18n/lib";
import { getT } from "@/features/core/i18n/server";
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
