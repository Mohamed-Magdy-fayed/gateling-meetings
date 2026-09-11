import { ArrowLeftIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { LinkButton } from "@/components/general/link-button";

type BackLinkBaseProps = { href: string } & Omit<
  ComponentProps<typeof LinkButton>,
  "children"
>;

// Icon-only (no `text`) would otherwise render an unnamed link for
// assistive-technology users — require an `aria-label` in that case.
type BackLinkProps =
  | (BackLinkBaseProps & { text: string; "aria-label"?: string })
  | (BackLinkBaseProps & { text?: never; "aria-label": string });

export function BackLink({ href, text, ...props }: BackLinkProps) {
  return (
    <LinkButton {...props} href={href}>
      <ArrowLeftIcon className="rtl:rotate-180" />
      {text}
    </LinkButton>
  );
}
