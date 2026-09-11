import { LoaderIcon } from "lucide-react";
import { cn } from "@/lib/utils";

// No hardcoded English default: a caller with visible adjacent loading text
// (e.g. LoadingSwap) should mark this `aria-hidden` instead of double
// announcing; a standalone spinner should pass a localized `label`.
function Spinner({
  className,
  label,
  ...props
}: React.ComponentProps<"svg"> & { label?: string }) {
  return (
    <LoaderIcon
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
