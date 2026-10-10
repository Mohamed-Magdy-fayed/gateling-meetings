import Image from "next/image";

import { cn } from "@/lib/utils";

type MeetingsMarkProps = {
  /** Rendered square size in CSS pixels. */
  size?: number;
  className?: string;
};

/**
 * The Gateling Meetings product mark — the Gateling "G" with a camera. Only
 * the app's own identity uses it (header lockup, favicon); anything that
 * points at gateling.com keeps the plain company mark, `GatelingMark`.
 */
export function MeetingsMark({ size = 28, className }: MeetingsMarkProps) {
  return (
    <Image
      src="/brand/meetings-mark.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      priority
      className={cn("shrink-0 select-none", className)}
    />
  );
}
