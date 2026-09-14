import type { Metadata } from "next";

import { getLocaleCookie } from "@/features/core/i18n/server";
import { LegalDocumentPage } from "@/features/legal/components/legal-document";
import { termsDocuments } from "@/features/legal/content/terms";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleCookie();
  return {
    title: (locale === "ar" ? termsDocuments.ar : termsDocuments.en).title,
  };
}

export default function Page() {
  return <LegalDocumentPage documents={termsDocuments} />;
}
