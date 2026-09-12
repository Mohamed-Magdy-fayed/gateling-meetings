import { adminEmails } from "@/data/env/server";
import { normalizeEmail } from "./helpers";

/**
 * The app has no role column: who may manage integrations is the
 * `ADMIN_EMAILS` env var. Empty list = nobody, which is the safe default
 * on a fresh checkout.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails.has(normalizeEmail(email));
}
