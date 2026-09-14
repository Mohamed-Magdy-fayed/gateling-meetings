import type { PropsWithChildren } from "react";

import { SiteFooter } from "@/features/legal/components/site-footer";
import { SiteHeader } from "@/features/meetings/components/site-header";

export default function LandingLayout({ children }: PropsWithChildren) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
