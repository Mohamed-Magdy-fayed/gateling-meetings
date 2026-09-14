import { getLocaleCookie, getT } from "@/features/core/i18n/server";

import type { LegalDocuments, LegalSection } from "../content/types";

type LegalDocumentPageProps = {
  documents: LegalDocuments;
};

/**
 * One layout for every policy page: title, effective date, then sections
 * rendered from data so English and Arabic stay structurally identical.
 */
export async function LegalDocumentPage({ documents }: LegalDocumentPageProps) {
  const [{ t }, locale] = await Promise.all([getT(), getLocaleCookie()]);
  const doc = locale === "ar" ? documents.ar : documents.en;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 md:py-16">
      <header className="mb-10 space-y-2">
        <h1 className="font-display text-3xl tracking-tight text-balance sm:text-4xl">
          {doc.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("legal.effective", { date: new Date(doc.effectiveDate) })}
        </p>
      </header>
      <div className="space-y-4 text-pretty leading-relaxed">
        {doc.intro.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
      <div className="mt-10 space-y-8">
        {doc.sections.map((section) => (
          <Section key={section.heading} section={section} />
        ))}
      </div>
    </main>
  );
}

function Section({ section }: { section: LegalSection }) {
  return (
    <section className="space-y-3 text-pretty leading-relaxed">
      <h2 className="font-display text-xl">{section.heading}</h2>
      {section.paragraphs.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      {section.bullets && <Bullets items={section.bullets} />}
      {section.groups?.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="font-medium">{group.label}</p>
          <Bullets items={group.bullets} />
        </div>
      ))}
      {section.after?.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1.5 ps-6">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
