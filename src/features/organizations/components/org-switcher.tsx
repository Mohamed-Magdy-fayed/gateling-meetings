"use client";

import { useMutation } from "@tanstack/react-query";
import {
  Building2Icon,
  CheckIcon,
  ChevronDownIcon,
  CreditCardIcon,
  PlusIcon,
  SettingsIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
};

/**
 * Which org the session acts as. Rendered from server-loaded props (the
 * header already knows the list), so it costs no client fetch; switching
 * writes the session and refreshes server components.
 */
export function OrgSwitcher({ organizations, activeId }: OrgSwitcherProps) {
  const { t } = useTranslation();
  const trpc = useTRPC();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
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
              variant="ghost"
              className="max-w-48 gap-1.5"
              aria-label={t("organizations.switcher.label")}
            />
          }
        >
          <Building2Icon data-icon="inline-start" />
          <span className="truncate">{active?.name}</span>
          <ChevronDownIcon data-icon="inline-end" className="opacity-60" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
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
                {org.id === activeId && <CheckIcon className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href="/settings/organization" />}
            nativeButton={false}
          >
            <SettingsIcon className="size-4" />
            {t("organizations.settings.title")}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/settings/billing" />}
            nativeButton={false}
          >
            <CreditCardIcon className="size-4" />
            {t("billing.settings.title")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setCreating(true)}>
            <PlusIcon className="size-4" />
            {t("organizations.switcher.create")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
