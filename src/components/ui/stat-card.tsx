import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import type * as React from "react";

import { cn } from "@/lib/utils";

const toneClasses = {
  brand: "bg-accent text-primary",
  blue: "bg-sky-100 text-sky-600",
  green: "bg-mint-100 text-mint-600",
  violet: "bg-violet-100 text-violet-600",
} as const;

type StatCardProps = React.ComponentProps<"div"> & {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: React.ReactNode;
  delta?: React.ReactNode;
  deltaTone?: "up" | "down";
  tone?: keyof typeof toneClasses;
  description?: React.ReactNode;
};

function StatCard({
  className,
  label,
  value,
  icon,
  delta,
  deltaTone,
  tone = "brand",
  description,
  ...props
}: StatCardProps) {
  const resolvedDeltaTone =
    deltaTone ??
    (typeof delta === "string" && delta.trim().startsWith("-") ? "down" : "up");
  const DeltaIcon =
    resolvedDeltaTone === "down" ? TrendingDownIcon : TrendingUpIcon;

  return (
    <div
      data-slot="stat-card"
      className={cn("rounded-lg border bg-card p-5 shadow-sm", className)}
      {...props}
    >
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-muted-foreground">{label}</span>
        {icon && (
          <span
            className={cn(
              "flex size-[38px] items-center justify-center rounded-md [&_svg]:size-[18px]",
              toneClasses[tone],
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2.5">
        <span className="font-display text-2xl font-bold leading-none text-foreground">
          {value}
        </span>
        {delta != null && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-sm font-extrabold",
              resolvedDeltaTone === "down"
                ? "text-destructive"
                : "text-success",
            )}
          >
            <DeltaIcon className="size-3.5" />
            {delta}
          </span>
        )}
      </div>
      {description && (
        <div className="mt-1.5 flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {description}
        </div>
      )}
    </div>
  );
}

export { StatCard };
