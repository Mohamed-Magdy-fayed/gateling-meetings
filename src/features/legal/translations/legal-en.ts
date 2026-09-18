import { dt } from "@/features/core/i18n/lib";

export const legalEn = {
  effective: dt("Effective {date:date}", {
    date: { date: { dateStyle: "long" } },
  }),
  footer: {
    terms: "Terms",
    privacy: "Privacy",
    refunds: "Refunds & cancellation",
    contact: "Contact",
    company: "Gateling Solutions",
    legal: "Legal",
  },
} as const;
