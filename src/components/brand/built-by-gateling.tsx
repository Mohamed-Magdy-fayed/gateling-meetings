import { ArrowUpRightIcon } from "lucide-react";

import { getT } from "@/features/core/i18n/server";
import { LEGAL_ENTITY } from "@/features/legal/content/types";
import { cn } from "@/lib/utils";

import { GatelingMark } from "./gateling-mark";

type BuiltByGatelingProps = {
  className?: string;
};

/**
 * One-line credit that answers "who built this?" and points at the parent
 * site. Used in the footer and on pages that stand outside the app shell.
 */
export async function BuiltByGateling({ className }: BuiltByGatelingProps) {
  const { t } = await getT();

  return (
    <a
      href={LEGAL_ENTITY.site}
      target="_blank"
      rel="noopener"
      className={cn(
        "group/built inline-flex items-center gap-2 rounded-full border border-border bg-card py-1 pe-3 ps-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground",
        className,
      )}
    >
      <GatelingMark size={18} />
      <span>
        {t("brand.builtBy")}{" "}
        <span className="font-semibold text-foreground">
          {t("brand.company")}
        </span>
      </span>
      <ArrowUpRightIcon
        aria-hidden
        className="size-3.5 opacity-60 transition-transform group-hover/built:-translate-y-px group-hover/built:translate-x-px rtl:-scale-x-100"
      />
    </a>
  );
}
