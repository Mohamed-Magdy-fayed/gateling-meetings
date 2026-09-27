export type LegalSection = {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  /** Text after the bullets, when a section closes with a note. */
  after?: string[];
  /** Labelled bullet groups, for a section that lists several kinds of things. */
  groups?: { label: string; bullets: string[] }[];
};

export type LegalDocument = {
  title: string;
  /** ISO date; formatted per locale on the page. */
  effectiveDate: string;
  intro: string[];
  sections: LegalSection[];
};

export type LegalDocuments = Record<"en" | "ar", LegalDocument>;

/** The seller named in every document; Paymob only processes the payments. */
export const LEGAL_ENTITY = {
  name: "Gateling",
  city: "Cairo",
  country: "Egypt",
  email: "info@gateling.com",
  /** Same line as gateling.com's phone and WhatsApp (its `lib/phone.ts`). */
  phone: "+201123862218",
  phoneDisplay: "+20 112 386 2218",
  site: "https://gateling.com",
  product: "Gateling Meetings",
  productUrl: "https://meetings.gateling.com",
} as const;

export const LEGAL_EFFECTIVE_DATE = "2026-09-18";
