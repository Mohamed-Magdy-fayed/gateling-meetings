import Link from "next/link";

import { getT } from "@/features/core/i18n/server";
import { cn } from "@/lib/utils";

import { GatelingMark } from "./gateling-mark";

type BrandLockupProps = {
  /** `header` is compact; `hero` is the larger stacked version for auth and empty pages. */
  size?: "header" | "hero";
  className?: string;
};

/**
 * Mark + "Gateling" wordmark + a "Meetings" product tag. The wordmark leads
 * so a visitor reads the company first and the product second — the product
 * lives under the gateling.com brand, not beside it.
 */
export async function BrandLockup({
  size = "header",
  className,
}: BrandLockupProps) {
  const { t } = await getT();
  const isHero = size === "hero";

  return (
    <Link
      href="/"
      aria-label={t("appName")}
      className={cn(
        "group/brand inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        className,
      )}
    >
      <GatelingMark
        size={isHero ? 44 : 30}
        className="transition-transform duration-300 ease-spring group-hover/brand:-rotate-6"
      />
      <span
        className={cn(
          "flex items-baseline gap-1.5 font-display leading-none tracking-tight",
          isHero ? "text-2xl" : "text-base",
        )}
      >
        <span className="font-bold text-foreground">{t("logoName")}</span>
        <span
          className={cn(
            "rounded-sm bg-accent px-1.5 py-0.5 font-semibold text-accent-foreground",
            isHero ? "text-sm" : "text-[0.7rem]",
          )}
        >
          {t("brand.product")}
        </span>
      </span>
    </Link>
  );
}
