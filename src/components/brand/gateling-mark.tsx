import Image from "next/image";

import { cn } from "@/lib/utils";

type GatelingMarkProps = {
  /** Rendered square size in CSS pixels. */
  size?: number;
  className?: string;
};

/**
 * The Gateling company "G" mark — the same shape gateling.com uses, so the
 * two sites are visibly one brand. The app's own header and favicon use
 * `MeetingsMark` instead. Decorative wherever a text label sits beside it;
 * pass `alt` through the lockup instead when it stands alone.
 */
export function GatelingMark({ size = 28, className }: GatelingMarkProps) {
  return (
    <Image
      src="/brand/gateling-mark.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      className={cn("shrink-0 select-none", className)}
    />
  );
}
