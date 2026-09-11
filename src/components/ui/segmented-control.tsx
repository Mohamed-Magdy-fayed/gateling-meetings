import type * as React from "react";

import { cn } from "@/lib/utils";

type SegmentedControlOption = {
  value: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
};

type SegmentedControlProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SegmentedControlOption[];
  size?: "sm" | "md";
  fullWidth?: boolean;
  className?: string;
};

function SegmentedControl({
  value,
  onValueChange,
  options,
  size = "md",
  fullWidth = false,
  className,
}: SegmentedControlProps) {
  return (
    <div
      data-slot="segmented-control"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md bg-muted p-1",
        fullWidth && "flex w-full",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-sm text-xs font-semibold transition-all ease-spring",
              size === "sm" ? "h-8 px-3" : "h-10 px-4",
              fullWidth && "flex-1",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl, type SegmentedControlOption };
