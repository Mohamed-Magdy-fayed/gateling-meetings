import type * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type AvatarGroupItem = {
  name: string;
  imageUrl?: string;
};

type AvatarGroupProps = React.ComponentProps<"div"> & {
  items: AvatarGroupItem[];
  max?: number;
  size?: "sm" | "md";
};

function AvatarGroup({
  className,
  items,
  max = 4,
  size = "md",
  ...props
}: AvatarGroupProps) {
  const visible = items.slice(0, Math.max(0, max));
  const overflow = items.length - visible.length;
  const sizeClass = size === "sm" ? "size-7" : "size-9";

  return (
    <div
      data-slot="avatar-group"
      className={cn(
        "flex items-center -space-x-2.5 rtl:space-x-reverse",
        className,
      )}
      {...props}
    >
      {visible.map((item, index) => (
        <Avatar
          // biome-ignore lint/suspicious/noArrayIndexKey: props-driven static list, order isn't reordered by user interaction
          key={`${item.name}-${index}`}
          className={cn(sizeClass, "border-2 border-card")}
        >
          <AvatarImage src={item.imageUrl} alt={item.name} />
          <AvatarFallback className="text-xs font-semibold">
            {item.name.slice(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <div
          className={cn(
            sizeClass,
            "flex items-center justify-center rounded-full border-2 border-card bg-muted text-xs font-bold text-muted-foreground",
          )}
        >
          +{overflow}
        </div>
      )}
    </div>
  );
}

export { AvatarGroup, type AvatarGroupItem };
