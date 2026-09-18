"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Building2Icon,
  CalendarPlusIcon,
  CheckIcon,
  ChevronDownIcon,
  CreditCardIcon,
  LogOutIcon,
  PlugZapIcon,
  PlusIcon,
  SettingsIcon,
  ShieldIcon,
  UserRoundIcon,
  VideoIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

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
import { signOutAction } from "@/features/core/auth/nextjs/actions";
import { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";
import { CreateOrganizationDialog } from "./create-organization-dialog";

export type SwitcherOrganization = {
  id: string;
  name: string;
  isPersonal: boolean;
  role: "owner" | "admin" | "member";
};

type OrgSwitcherProps = {
  organizations: SwitcherOrganization[];
  activeId: string;
  /** The active org may manage API integrations (owner/admin on a plan with API access, or a platform admin). */
  showIntegrations?: boolean;
  /** Platform admin: gets the /admin entry. */
  isAdmin?: boolean;
};

/**
 * The one account menu in the header: which org the session acts as, where
 * to go in the app, the org's settings, and sign out. Rendered from
 * server-loaded props (the header already knows the list), so it costs no
 * client fetch; switching writes the session and refreshes server components.
 */
export function OrgSwitcher({
  organizations,
  activeId,
  showIntegrations = false,
  isAdmin = false,
}: OrgSwitcherProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [isSigningOut, startSignOut] = useTransition();
  const active = organizations.find((org) => org.id === activeId);

  const switchOrg = useMutation(
    trpc.organizations.switch.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              className="size-9 shrink-0 justify-center px-0 max-md:border-transparent max-md:bg-accent max-md:text-accent-foreground max-md:hover:bg-accent/80 md:size-auto md:h-9 md:max-w-52 md:gap-2 md:ps-2.5 md:pe-3"
              aria-label={t("organizations.switcher.label")}
            />
          }
        >
          {/* On phones the button is the accent disc itself; from md the disc shrinks and the org name joins it. */}
          <span className="grid size-9 shrink-0 place-items-center rounded-full md:size-6 md:bg-accent md:text-accent-foreground">
            <Building2Icon className="size-4 md:size-3.5" />
          </span>
          <span className="hidden truncate md:inline">{active?.name}</span>
          <span className="hidden md:inline-flex">
            <ChevronDownIcon className="size-4 opacity-60" />
          </span>
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
                onClick={() =>
                  org.id !== activeId &&
                  switchOrg.mutate({ organizationId: org.id })
                }
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
            <DropdownMenuItem
              render={<Link href="/settings/organization" />}
              nativeButton={false}
            >
              <SettingsIcon />
              {t("organizations.settings.title")}
            </DropdownMenuItem>
            <DropdownMenuItem
              render={<Link href="/settings/billing" />}
              nativeButton={false}
            >
              <CreditCardIcon />
              {t("billing.settings.title")}
            </DropdownMenuItem>
            {showIntegrations && (
              <DropdownMenuItem
                render={<Link href="/settings/integrations" />}
                nativeButton={false}
              >
                <PlugZapIcon />
                {t("integrations.admin.title")}
              </DropdownMenuItem>
            )}
            {isAdmin && (
              <DropdownMenuItem
                render={<Link href="/admin" />}
                nativeButton={false}
              >
                <ShieldIcon />
                {t("admin.title")}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href="/settings/account" />}
            nativeButton={false}
          >
            <UserRoundIcon />
            {t("settings.tabs.account")}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            disabled={isSigningOut}
            onClick={() =>
              startSignOut(async () => {
                await signOutAction();
              })
            }
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
