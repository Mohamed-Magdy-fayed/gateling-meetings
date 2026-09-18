"use client";

import {
  Building2Icon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  LogOutIcon,
  PlusIcon,
  VideoIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTranslation } from "@/features/core/i18n/client";
import type { AccountMenuData } from "@/features/organizations/server/account-menu";

import { CreateOrganizationDialog } from "./create-organization-dialog";
import {
  ACCOUNT_LINK,
  accountLinks,
  useSignOut,
  useSwitchOrganization,
} from "./use-account-menu";

/**
 * The account menu in the header from md up: which org the session acts
 * as, where to go in the app, the org's settings, and sign out. Rendered
 * from server-loaded props (the header already knows the list), so it costs
 * no client fetch. On phones the bottom bar's "More" sheet plays this role.
 */
export function OrgSwitcher({
  organizations,
  activeId,
  showIntegrations,
  isAdmin,
}: AccountMenuData) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const active = organizations.find((org) => org.id === activeId);
  const switchOrg = useSwitchOrganization(activeId);
  const { signOut, isPending: isSigningOut } = useSignOut();
  const links = accountLinks({ showIntegrations, isAdmin });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="h-9 max-w-52 shrink-0 gap-2 ps-2.5 pe-3"
              aria-label={t("organizations.switcher.label")}
            />
          }
        >
          <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
            <Building2Icon className="size-3.5" />
          </span>
          <span className="truncate">{active?.name}</span>
          <ChevronDownIcon className="size-4 opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          <DropdownMenuGroup>
            <DropdownMenuItem
              render={<Link href="/dashboard" />}
              nativeButton={false}
            >
              <VideoIcon />
              {t("meetings.dashboard.title")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href="/schedule" />}
              nativeButton={false}
            >
              <CalendarPlusIcon />
              {t("meetings.sections.schedule")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("organizations.switcher.label")}
            </DropdownMenuLabel>
            {organizations.map((org) => (
              <DropdownMenuItem
                key={org.id}
                disabled={switchOrg.isPending}
                onClick={() => switchOrg.switchTo(org.id)}
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate">{org.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {org.isPersonal
                      ? t("organizations.switcher.personalHint")
                      : t(`organizations.roles.${org.role}`)}
                  </span>
                </span>
                {org.id === activeId && (
                  <CheckIcon className="size-4 text-primary" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setCreating(true)}>
              <PlusIcon />
              {t("organizations.switcher.create")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {links.map(({ href, Icon, label }) => (
              <DropdownMenuItem
                key={href}
                render={<Link href={href} />}
                nativeButton={false}
              >
                <Icon />
                {label(t)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href={ACCOUNT_LINK.href} />}
            nativeButton={false}
          >
            <ACCOUNT_LINK.Icon />
            {ACCOUNT_LINK.label(t)}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={isSigningOut}
            onClick={signOut}
          >
            <LogOutIcon />
            {t("auth.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
