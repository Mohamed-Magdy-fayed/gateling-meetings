import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const iconButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center transition-all ease-spring outline-none disabled:pointer-events-none disabled:opacity-50 hover:-translate-y-px active:translate-y-0 active:scale-[0.92] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground shadow-[var(--shadow-brand-sm)] hover:bg-primary/90 hover:shadow-[var(--shadow-brand)]",
        secondary:
          "border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        soft: "bg-accent text-accent-foreground hover:bg-accent/70",
        ghost:
          "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      },
      size: {
        sm: "size-8 rounded-md",
        md: "size-10 rounded-md",
        lg: "size-12 rounded-lg",
      },
      shape: {
        rounded: "",
        circle: "rounded-full!",
      },
    },
    defaultVariants: {
      variant: "ghost",
      size: "md",
      shape: "rounded",
    },
  },
);

type IconButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof iconButtonVariants> & {
    label: string;
  };

function IconButton({
  className,
  variant,
  size,
  shape,
  label,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      data-slot="icon-button"
      type={type}
      aria-label={label}
      title={label}
      className={cn(iconButtonVariants({ variant, size, shape }), className)}
      {...props}
    />
  );
}

export { IconButton, iconButtonVariants };
