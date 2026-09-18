"use client";

import {
  Building2Icon,
  CheckIcon,
  LogOutIcon,
  type LucideIcon,
  PlusIcon,
} from "lucide-react";
import Link from "next/link";
import { type ComponentProps, type ReactNode, useState } from "react";

import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetGrabber,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useTranslation } from "@/features/core/i18n/client";
import type { AccountMenuData } from "@/features/organizations/server/account-menu";
import { cn } from "@/lib/utils";

import { CreateOrganizationDialog } from "./create-organization-dialog";
import {
  ACCOUNT_LINK,
  accountLinks,
  useSignOut,
  useSwitchOrganization,
} from "./use-account-menu";

type AccountSheetProps = AccountMenuData & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The bottom bar's "More": what the header's account dropdown holds from md
 * up, laid out for thumbs. The active org heads the sheet; switching,
 * settings, admin, pricing and sign-out follow in touch-sized rows.
 */
export function AccountSheet({
  open,
  onOpenChange,
  organizations,
  activeId,
  showIntegrations,
  isAdmin,
}: AccountSheetProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const active = organizations.find((org) => org.id === activeId);
  const switchOrg = useSwitchOrganization(activeId);
  const { signOut, isPending: isSigningOut } = useSignOut();
  const links = accountLinks({
    showIntegrations,
    isAdmin,
    includePricing: true,
  });

  const orgHint = (org: AccountMenuData["organizations"][number]) =>
    org.isPersonal
      ? t("organizations.switcher.personalHint")
      : t(`organizations.roles.${org.role}`);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          className="rounded-t-xl pb-[env(safe-area-inset-bottom,0px)]"
        >
          <SheetGrabber />
          <SheetHeader className="flex-row items-center gap-3 p-4 pb-2">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
              <Building2Icon className="size-5" />
            </span>
            <div className="min-w-0">
              <SheetTitle className="truncate text-base">
                {active?.name}
              </SheetTitle>
              {active && <SheetDescription>{orgHint(active)}</SheetDescription>}
            </div>
          </SheetHeader>

          <SheetBody className="px-2 pb-2">
            <SheetSection label={t("organizations.switcher.label")}>
              {organizations.map((org) => {
                const isActive = org.id === activeId;
                return (
                  <SheetRow
                    key={org.id}
                    disabled={switchOrg.isPending}
                    aria-current={isActive || undefined}
                    onClick={() => {
                      if (isActive) return;
                      switchOrg.switchTo(org.id);
                      onOpenChange(false);
                    }}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{org.name}</span>
                      <span className="text-xs font-normal text-muted-foreground">
                        {orgHint(org)}
                      </span>
                    </span>
                    {isActive && <CheckIcon className="text-primary" />}
                  </SheetRow>
                );
              })}
              <SheetRow
                Icon={PlusIcon}
                onClick={() => {
                  onOpenChange(false);
                  setCreating(true);
                }}
              >
                {t("organizations.switcher.create")}
              </SheetRow>
            </SheetSection>

            <SheetSection>
              {links.map(({ href, Icon, label }) => (
                <SheetRow key={href} href={href} Icon={Icon}>
                  {label(t)}
                </SheetRow>
              ))}
            </SheetSection>

            <SheetSection>
              <SheetRow href={ACCOUNT_LINK.href} Icon={ACCOUNT_LINK.Icon}>
                {ACCOUNT_LINK.label(t)}
              </SheetRow>
              <SheetRow
                Icon={LogOutIcon}
                disabled={isSigningOut}
                onClick={signOut}
                className="text-destructive hover:bg-destructive/10 active:bg-destructive/10 [&_svg]:text-destructive"
              >
                {t("auth.signOut")}
              </SheetRow>
            </SheetSection>
          </SheetBody>
        </SheetContent>
      </Sheet>
      <CreateOrganizationDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function SheetSection({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border pt-1 first:border-t-0 first:pt-0">
      {label && (
        <h3 className="px-3 pt-2 pb-1 font-sans text-xs font-medium tracking-normal text-muted-foreground">
          {label}
        </h3>
      )}
      {children}
    </section>
  );
}

const rowClass =
  "flex h-12 w-full items-center gap-3 rounded-lg px-3 text-start text-sm font-medium text-foreground outline-none transition-colors select-none hover:bg-muted active:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

type SheetRowProps = {
  Icon?: LucideIcon;
  children: ReactNode;
  className?: string;
} & (
  | { href: string; onClick?: never; disabled?: never }
  | ({ href?: never } & Pick<
      ComponentProps<"button">,
      "onClick" | "disabled" | "aria-current"
    >)
);

/** One touch-sized line of the sheet: a link when it goes somewhere, a button when it does something. */
function SheetRow({ Icon, children, className, ...props }: SheetRowProps) {
  const body = (
    <>
      {Icon && <Icon />}
      {children}
    </>
  );
  if (props.href !== undefined) {
    return (
      <Link href={props.href} className={cn(rowClass, className)}>
        {body}
      </Link>
    );
  }
  const { href: _href, ...button } = props;
  return (
    <button type="button" className={cn(rowClass, className)} {...button}>
      {body}
    </button>
  );
}
