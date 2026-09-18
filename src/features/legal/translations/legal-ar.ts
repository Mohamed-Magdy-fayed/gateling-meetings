import { dt } from "@/features/core/i18n/lib";

export const legalAr = {
  effective: dt("سارية اعتبارًا من {date:date}", {
    date: { date: { dateStyle: "long" } },
  }),
  footer: {
    terms: "الشروط",
    privacy: "الخصوصية",
    refunds: "الاسترداد والإلغاء",
    contact: "تواصل معنا",
    company: "Gateling Solutions",
    legal: "القانونية",
  },
} as const;
