import type * as React from "react";

import { cn } from "@/lib/utils";

type EmptyStateProps = React.ComponentProps<"div"> & {
  icon?: React.ReactNode;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  compact?: boolean;
};

function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  compact = false,
  ...props
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2 text-center",
        compact ? "px-6 py-8" : "px-8 py-14",
        className,
      )}
      {...props}
    >
      {icon && (
        <div className="mb-2 flex size-16 items-center justify-center rounded-full bg-accent text-primary [&_svg]:size-7">
          {icon}
        </div>
      )}
      {title && (
        <div className="font-display text-lg font-semibold text-foreground">
          {title}
        </div>
      )}
      {description && (
        <div className="max-w-sm text-sm text-muted-foreground">
          {description}
        </div>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export { EmptyState };
