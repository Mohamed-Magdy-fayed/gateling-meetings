import type { Meeting, Organization, User } from "@/drizzle/schema";
import {
  type ResolvedEntitlements,
  resolveEntitlements,
} from "@/features/billing/plans";
import { isAdminEmail } from "@/features/core/auth/core/admin";

export type MeetingWithOwner = Meeting & {
  organization: Organization;
  host: Pick<User, "email">;
};

/**
 * What a *room* is allowed: the plan of the org that owns the meeting,
 * never the joiner's. `/m/[code]` is public, so the joiner usually has no
 * plan at all — and a guest joining a paid host's room must get the paid
 * host's limits.
 */
export function entitlementsForMeeting(
  meeting: MeetingWithOwner,
): ResolvedEntitlements {
  return resolveEntitlements(meeting.organization, {
    isAdmin: isAdminEmail(meeting.host.email),
  });
}

/**
 * What an *organization* is allowed on its own, with no session in hand —
 * for API keys. A personal org whose owner is in `ADMIN_EMAILS` is
 * unlimited, matching what that owner sees when signed in.
 */
export function entitlementsForOrganization(
  organization: Organization & { personalOwner: Pick<User, "email"> | null },
): ResolvedEntitlements {
  return resolveEntitlements(organization, {
    isAdmin: isAdminEmail(organization.personalOwner?.email),
  });
}
