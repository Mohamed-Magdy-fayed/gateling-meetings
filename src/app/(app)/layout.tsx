import type { PropsWithChildren } from "react";

import { SiteFooter } from "@/features/legal/components/site-footer";
import { SiteHeader } from "@/features/meetings/components/site-header";

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}
