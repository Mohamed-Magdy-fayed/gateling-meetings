import type { Metadata } from "next";

import { getLocaleCookie } from "@/features/core/i18n/server";
import { LegalDocumentPage } from "@/features/legal/components/legal-document";
import { privacyDocuments } from "@/features/legal/content/privacy";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocaleCookie();
  return {
    title: (locale === "ar" ? privacyDocuments.ar : privacyDocuments.en).title,
  };
}

export default function Page() {
  return <LegalDocumentPage documents={privacyDocuments} />;
}
