import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/drizzle";
import { type User, UsersTable } from "@/drizzle/schema";
import { getUserSession } from "@/features/core/auth/core";
import type { PartialUser } from "@/features/core/auth/types";

function _getCurrentUser(options: {
  withFullUser: true;
  redirectIfNotFound: true;
}): Promise<User>;
function _getCurrentUser(options: {
  withFullUser: true;
  redirectIfNotFound?: false;
}): Promise<User | null>;
function _getCurrentUser(options: {
  withFullUser?: false;
  redirectIfNotFound: true;
}): Promise<PartialUser>;
function _getCurrentUser(options?: {
  withFullUser?: false;
  redirectIfNotFound?: false;
}): Promise<PartialUser | null>;
async function _getCurrentUser({
  withFullUser = false,
  redirectIfNotFound = false,
}: {
  withFullUser?: boolean;
  redirectIfNotFound?: boolean;
} = {}): Promise<User | PartialUser | null> {
  const cookieStore = await cookies();
  const session = await getUserSession(cookieStore);
  if (session?.user == null) {
    if (redirectIfNotFound) return redirect("/auth/sign-in");
    return null;
  }

  if (withFullUser) {
    const fullUser = await db.query.UsersTable.findFirst({
      where: eq(UsersTable.id, session.user.id),
    });
    // The session referenced a user row that no longer exists (e.g. deleted
    // between session creation and this request) — treat it like no session.
    if (fullUser == null) {
      if (redirectIfNotFound) return redirect("/auth/sign-in");
      return null;
    }
    return fullUser;
  }

  return session.user;
}

export const getCurrentUser = _getCurrentUser;
