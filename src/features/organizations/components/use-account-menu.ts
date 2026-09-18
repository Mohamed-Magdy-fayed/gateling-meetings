"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CreditCardIcon,
  type LucideIcon,
  PlugZapIcon,
  SettingsIcon,
  ShieldIcon,
  TagIcon,
  UserRoundIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { signOutAction } from "@/features/core/auth/nextjs/actions";
import type { useTranslation } from "@/features/core/i18n/client";
import { useTRPC } from "@/integrations/trpc/client";

type Translate = ReturnType<typeof useTranslation>["t"];

export type AccountLink = {
  href: string;
  Icon: LucideIcon;
  /** Resolved at render time; each entry names its own literal key so `t` stays typed. */
  label: (t: Translate) => string;
};

/**
 * The settings-and-admin part of the account menu, in the order both
 * surfaces (header dropdown, phone "More" sheet) list it. Pricing sits here
 * only for phones — from md up the header shows it as its own link.
 */
export function accountLinks({
  showIntegrations,
  isAdmin,
  includePricing = false,
}: {
  showIntegrations: boolean;
  isAdmin: boolean;
  includePricing?: boolean;
}): AccountLink[] {
  const links: AccountLink[] = [
    {
      href: "/settings/organization",
      Icon: SettingsIcon,
      label: (t) => t("organizations.settings.title"),
    },
    {
      href: "/settings/billing",
      Icon: CreditCardIcon,
      label: (t) => t("billing.settings.title"),
    },
  ];
  if (showIntegrations) {
    links.push({
      href: "/settings/integrations",
      Icon: PlugZapIcon,
      label: (t) => t("integrations.admin.title"),
    });
  }
  if (isAdmin) {
    links.push({
      href: "/admin",
      Icon: ShieldIcon,
      label: (t) => t("admin.title"),
    });
  }
  if (includePricing) {
    links.push({
      href: "/pricing",
      Icon: TagIcon,
      label: (t) => t("billing.pricing.nav"),
    });
  }
  return links;
}

export const ACCOUNT_LINK: AccountLink = {
  href: "/settings/account",
  Icon: UserRoundIcon,
  label: (t) => t("settings.tabs.account"),
};

/** Switching writes the session and refreshes server components. */
export function useSwitchOrganization(activeId: string) {
  const trpc = useTRPC();
  const router = useRouter();
  const mutation = useMutation(
    trpc.organizations.switch.mutationOptions({
      onSuccess: () => router.refresh(),
      onError: (error) => toast.error(error.message),
    }),
  );
  return {
    isPending: mutation.isPending,
    switchTo: (organizationId: string) => {
      if (organizationId !== activeId) mutation.mutate({ organizationId });
    },
  };
}

export function useSignOut() {
  const [isPending, startTransition] = useTransition();
  return {
    isPending,
    signOut: () =>
      startTransition(async () => {
        await signOutAction();
      }),
  };
}
