import type { Metadata } from "next";

import { getLocaleCookie } from "@/features/core/i18n/server";
import { LegalDocumentPage } from "@/features/legal/components/legal-document";
import { refundsDocuments } from "@/features/legal/content/refunds";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleCookie();
  return {
    title: (locale === "ar" ? refundsDocuments.ar : refundsDocuments.en).title,
  };
}

export default function Page() {
  return <LegalDocumentPage documents={refundsDocuments} />;
}
