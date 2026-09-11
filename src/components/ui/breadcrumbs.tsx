import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Fragment } from "react";

import { cn } from "@/lib/utils";

type BreadcrumbItem = {
  label: React.ReactNode;
  href?: string;
};

type BreadcrumbsProps = React.ComponentProps<"nav"> & {
  items: BreadcrumbItem[];
};

function Breadcrumbs({ className, items, ...props }: BreadcrumbsProps) {
  return (
    <nav
      data-slot="breadcrumbs"
      aria-label="Breadcrumb"
      className={cn("flex items-center gap-1.5 text-sm", className)}
      {...props}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: props-driven static trail, order isn't reordered by user interaction
          <Fragment key={index}>
            {index > 0 && (
              <ChevronRightIcon className="size-3.5 shrink-0 text-muted-foreground rtl:rotate-180" />
            )}
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span
                aria-current={isLast ? "page" : undefined}
                className={cn(
                  "font-medium",
                  isLast ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {item.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

export { type BreadcrumbItem, Breadcrumbs };
