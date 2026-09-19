import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Card, CardContent } from "@/components/ui/card";

export type DocPage = { id: string; title: string; markdown: string };

/**
 * The developer docs (`docs/*.md`) rendered in the app for people who can
 * mint keys. Markdown only — no raw HTML gets through — so the files in git
 * stay the single source and nothing in them can script the page.
 */
export function DeveloperDocs({ pages }: { pages: DocPage[] }) {
  return (
    <div className="space-y-6">
      <nav
        aria-label="Sections"
        className="flex flex-wrap gap-2 text-sm"
        dir="ltr"
      >
        {pages.map((page) => (
          <a
            key={page.id}
            href={`#${page.id}`}
            className="rounded-full border border-border bg-card px-3 py-1 font-medium transition-colors hover:bg-muted"
          >
            {page.title}
          </a>
        ))}
      </nav>
      {pages.map((page) => (
        <Card key={page.id} id={page.id} className="scroll-mt-24">
          <CardContent className="p-6" dir="ltr">
            <article className="prose-docs">
              <Markdown remarkPlugins={[remarkGfm]} skipHtml>
                {page.markdown}
              </Markdown>
            </article>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
