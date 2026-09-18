import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-20 w-full resize-none rounded-md border border-border bg-muted/60 px-3 py-2 text-sm transition-colors outline-none placeholder:text-muted-foreground/80 hover:border-foreground/25 focus-visible:border-primary focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:bg-muted/40 dark:focus-visible:bg-card",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
