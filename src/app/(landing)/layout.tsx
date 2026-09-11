import type { PropsWithChildren } from "react";

import { SiteHeader } from "@/features/meetings/components/site-header";

export default function LandingLayout({ children }: PropsWithChildren) {
  return (
    <>
      <SiteHeader />
      {children}
    </>
  );
}
