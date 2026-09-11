import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import type * as React from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ButtonStyleProps = VariantProps<typeof buttonVariants> & {
  className?: string;
};

type LinkButtonProps = Omit<React.ComponentProps<typeof Link>, "className"> &
  ButtonStyleProps;

export function LinkButton({
  variant = "default",
  size = "default",
  className,
  ...props
}: LinkButtonProps) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}
