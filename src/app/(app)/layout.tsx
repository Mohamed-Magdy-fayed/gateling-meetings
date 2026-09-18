import type { PropsWithChildren } from "react";

import { SiteShell } from "@/features/meetings/components/site-shell";

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <SiteShell>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>
    </SiteShell>
  );
}
