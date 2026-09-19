import { cookies } from "next/headers";
import { cache } from "react";

import { companionConfig } from "@/data/env/server";
import { db } from "@/drizzle";
import { resolveEntitlements } from "@/features/billing/plans";
import { isAdminEmail } from "@/features/core/auth/core/admin";
import { getUserSession } from "@/features/core/auth/core/session";

import { listUserOrganizations, loadActiveOrganization } from "./service";

export type AccountMenuOrganization = {
  id: string;
  name: string;
  isPersonal: boolean;
  role: "owner" | "admin" | "member";
};

export type AccountMenuData = {
  organizations: AccountMenuOrganization[];
  activeId: string;
  /** Org owners/admins on a plan with API access, or a platform admin. */
  showIntegrations: boolean;
  /** Platform admin: gets the /admin entry. */
  isAdmin: boolean;
  /** The AI companion is configured (a model key is set). */
  companionEnabled: boolean;
};

/**
 * Everything the account menu needs, whichever surface renders it: the
 * header's dropdown from md up, the bottom bar's "More" sheet on phones.
 * Both render in the same request, so `cache` makes the session and org
 * lookups happen once. `null` means no signed-in member with an active org —
 * the chrome then shows a sign-in button and no bottom bar.
 */
export const loadAccountMenu = cache(
  async (): Promise<AccountMenuData | null> => {
    const session = await getUserSession(await cookies());
    if (!session) return null;

    const isAdmin = isAdminEmail(session.user.email);
    const [active, memberships] = await Promise.all([
      loadActiveOrganization(db, session.user.id, session.orgId ?? null),
      listUserOrganizations(db, session.user.id),
    ]);
    if (!active) return null;

    const showIntegrations =
      isAdmin ||
      (["owner", "admin"].includes(active.membership.role) &&
        resolveEntitlements(active.organization).apiAccess);

    return {
      activeId: active.organization.id,
      isAdmin,
      companionEnabled: companionConfig != null,
      showIntegrations,
      organizations: memberships.map(({ organization, membership }) => ({
        id: organization.id,
        name: organization.name,
        isPersonal: organization.personalOwnerId != null,
        role: membership.role,
      })),
    };
  },
);
