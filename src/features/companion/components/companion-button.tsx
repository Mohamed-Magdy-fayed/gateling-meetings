"use client";

import { SparklesIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useTranslation } from "@/features/core/i18n/client";

import { CompanionSheet } from "./companion-sheet";

/**
 * The header's way into the companion: one icon beside the global toggles,
 * on every size. Hidden inside a room, where there is no header anyway.
 */
export function CompanionButton() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (pathname.startsWith("/m/")) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t("companion.open")}
        onClick={() => setOpen(true)}
      >
        <SparklesIcon />
      </Button>
      <CompanionSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
