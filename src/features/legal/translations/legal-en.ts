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
    tagline: "Video meetings you host yourself.",
    partOf:
      "Gateling Meetings is a product of Gateling Solutions, the software studio behind gateling.com.",
    groups: {
      product: "Product",
      company: "Company",
      legal: "Legal",
    },
    product: {
      home: "Home",
      dashboard: "Your meetings",
      signIn: "Sign in",
    },
    companyLinks: {
      site: "gateling.com",
      about: "About Gateling",
      services: "Services",
      work: "Our work",
    },
    rights: "All rights reserved.",
  },
} as const;
