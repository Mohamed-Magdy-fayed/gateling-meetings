"use client";

import type { ComponentProps, PropsWithChildren } from "react";
import { cn } from "@/lib/utils";

type ScrollAreaProps = PropsWithChildren<ComponentProps<"div">>;

function ScrollArea({ className, children, ...props }: ScrollAreaProps) {
  return (
    <div
      data-slot="scroll-area"
      className={cn("relative min-h-0 overflow-auto", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export { ScrollArea };
