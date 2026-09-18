"use client";

import {
  CalendarPlusIcon,
  EllipsisIcon,
  HouseIcon,
  KeyboardIcon,
  LoaderCircleIcon,
  type LucideIcon,
  VideoIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";

import { useTranslation } from "@/features/core/i18n/client";
import { AccountSheet } from "@/features/organizations/components/account-sheet";
import type { AccountMenuData } from "@/features/organizations/server/account-menu";
import { cn } from "@/lib/utils";

import { JoinSheet } from "./join-sheet";
import { useCreateInstantMeeting } from "./new-meeting-button";

type SheetKind = "join" | "more";

/**
 * The phone chrome: a floating pill at the bottom, the shape of a native
 * tab bar. Five slots — Home, Schedule, the one primary action (start a
 * meeting) raised in the middle, Join, and More for everything the header's
 * account menu holds from md up. Fixed and sized purely in CSS (see the
 * `--mobile-nav-*` tokens), so nothing measures and nothing jumps; the
 * footer pads by the same token so no page ends underneath it.
 */
export function MobileNav(menu: AccountMenuData) {
  const { t } = useTranslation();
  const pathname = usePathname();
  // A sheet remembers where it was opened; a navigation from inside it
  // (a settings link, a switched org) leaves it closed on the next page.
  const [sheet, setSheet] = useState<{
    kind: SheetKind;
    pathname: string;
  } | null>(null);
  const openSheet = sheet?.pathname === pathname ? sheet.kind : null;
  const open = (kind: SheetKind) => setSheet({ kind, pathname });
  const close = () => setSheet(null);

  const isHome = pathname === "/dashboard" || pathname.startsWith("/meetings");
  const isSchedule = pathname.startsWith("/schedule");
  const isMorePage =
    pathname.startsWith("/settings") || pathname.startsWith("/admin");

  return (
    <>
      <nav
        aria-label={t("nav.label")}
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(var(--mobile-nav-gap)+env(safe-area-inset-bottom,0px))] md:hidden"
      >
        <div className="pointer-events-auto mx-auto grid h-(--mobile-nav-height) max-w-md grid-cols-5 items-stretch rounded-full border border-border bg-card/85 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-card/75">
          <NavTab
            href="/dashboard"
            Icon={HouseIcon}
            label={t("nav.home")}
            isActive={isHome}
          />
          <NavTab
            href="/schedule"
            Icon={CalendarPlusIcon}
            label={t("nav.schedule")}
            isActive={isSchedule}
          />
          <NewMeetingTab label={t("nav.newMeeting")} />
          <NavTab
            Icon={KeyboardIcon}
            label={t("nav.join")}
            isActive={openSheet === "join"}
            isExpanded={openSheet === "join"}
            onClick={() => open("join")}
          />
          <NavTab
            Icon={EllipsisIcon}
            label={t("nav.more")}
            isActive={openSheet === "more" || isMorePage}
            isExpanded={openSheet === "more"}
            onClick={() => open("more")}
          />
        </div>
      </nav>

      <JoinSheet
        open={openSheet === "join"}
        onOpenChange={(isOpen) => (isOpen ? open("join") : close())}
      />
      <AccountSheet
        {...menu}
        open={openSheet === "more"}
        onOpenChange={(isOpen) => (isOpen ? open("more") : close())}
      />
    </>
  );
}

type NavTabProps = {
  Icon: LucideIcon;
  label: ReactNode;
  isActive: boolean;
} & (
  | { href: string; onClick?: never; isExpanded?: never }
  | { href?: never; onClick: () => void; isExpanded: boolean }
);

/** One of the four side slots: an icon in a pill that lights up when active, and a short label. */
function NavTab({ Icon, label, isActive, ...props }: NavTabProps) {
  const className = cn(
    "group/tab flex h-full flex-col items-center justify-center gap-0.5 rounded-full text-muted-foreground outline-none transition-colors select-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
    isActive && "text-primary",
  );
  const body = (
    <>
      <span
        className={cn(
          "grid h-7 w-12 place-items-center rounded-full transition-[background-color,transform] duration-150 ease-standard group-active/tab:scale-95",
          isActive && "bg-accent text-accent-foreground",
        )}
      >
        <Icon className="size-5" strokeWidth={isActive ? 2.25 : 2} />
      </span>
      <span className="text-[11px] leading-none font-medium">{label}</span>
    </>
  );

  if (props.href !== undefined) {
    return (
      <Link
        href={props.href}
        aria-current={isActive ? "page" : undefined}
        className={className}
      >
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-expanded={props.isExpanded}
      className={className}
    >
      {body}
    </button>
  );
}

/** The raised primary disc in the middle: creates an instant meeting and goes straight into the room. */
function NewMeetingTab({ label }: { label: string }) {
  const { create, isPending } = useCreateInstantMeeting();
  return (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={create}
        disabled={isPending}
        aria-label={label}
        className="-mt-4 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-brand ring-4 ring-background transition-[transform,background-color,opacity] duration-150 ease-standard outline-none select-none hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-95 disabled:opacity-70"
      >
        {isPending ? (
          <LoaderCircleIcon className="size-6 animate-spin" />
        ) : (
          <VideoIcon className="size-6" />
        )}
      </button>
    </div>
  );
}
