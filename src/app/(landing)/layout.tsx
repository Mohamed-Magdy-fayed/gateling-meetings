import type { PropsWithChildren } from "react";

import { SiteShell } from "@/features/meetings/components/site-shell";

export default function LandingLayout({ children }: PropsWithChildren) {
  return <SiteShell>{children}</SiteShell>;
}
