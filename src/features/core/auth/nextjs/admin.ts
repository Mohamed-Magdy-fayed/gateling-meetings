import { notFound } from "next/navigation";

import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getCurrentUser } from "./currentUser";

/**
 * For admin pages. A signed-in non-admin gets a 404, not a 403 — the page
 * does not exist as far as they are concerned, and there is nothing to
 * request access to.
 */
export async function requireAdmin() {
  const user = await getCurrentUser({ redirectIfNotFound: true });
  if (!isAdminEmail(user.email)) notFound();
  return user;
}
