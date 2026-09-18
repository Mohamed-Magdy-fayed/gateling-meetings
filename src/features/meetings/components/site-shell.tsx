import type { PropsWithChildren } from "react";

import { SiteFooter } from "@/features/legal/components/site-footer";
import { loadAccountMenu } from "@/features/organizations/server/account-menu";

import { MobileNav } from "./mobile-nav";
import { SiteHeader } from "./site-header";

/**
 * The chrome around every page outside a meeting room: header, footer and,
 * for a signed-in member on a phone, the bottom bar. The footer pads by the
 * bar's height on phones so its links stay reachable — the padding and the
 * bar read the same CSS token, so they cannot drift apart.
 */
export async function SiteShell({ children }: PropsWithChildren) {
  const menu = await loadAccountMenu();

  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter
        className={menu ? "max-md:pb-(--mobile-nav-inset)" : undefined}
      />
      {menu && <MobileNav {...menu} />}
    </>
  );
}
