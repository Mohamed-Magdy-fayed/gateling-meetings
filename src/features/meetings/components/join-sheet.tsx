"use client";

import { useRef } from "react";

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

import { JoinByCodeForm } from "./join-by-code-form";

type JoinSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * The bottom bar's "Join": the same code-or-link form the dashboard shows,
 * raised as a sheet so it is one tap away from any page. Focus lands in the
 * field on open, so the keyboard is already up when the sheet settles.
 */
export function JoinSheet({ open, onOpenChange }: JoinSheetProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        initialFocus={inputRef}
        className="rounded-t-xl pb-[env(safe-area-inset-bottom,0px)]"
      >
        <SheetGrabber />
        <SheetHeader className="p-4 pb-3">
          <SheetTitle className="text-base">
            {t("nav.joinSheet.title")}
          </SheetTitle>
          <SheetDescription>{t("nav.joinSheet.lead")}</SheetDescription>
        </SheetHeader>
        <SheetBody className="px-4 pb-4">
          <JoinByCodeForm inputRef={inputRef} />
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
