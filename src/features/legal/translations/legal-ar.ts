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
    tagline: "اجتماعات مرئية تستضيفها بنفسك.",
    partOf:
      "Gateling Meetings منتج من Gateling Solutions، استوديو البرمجيات وراء gateling.com.",
    groups: {
      product: "المنتج",
      company: "الشركة",
      legal: "القانونية",
    },
    product: {
      home: "الرئيسية",
      dashboard: "اجتماعاتك",
      signIn: "تسجيل الدخول",
    },
    companyLinks: {
      site: "gateling.com",
      about: "عن Gateling",
      services: "الخدمات",
      work: "أعمالنا",
    },
    rights: "جميع الحقوق محفوظة.",
  },
} as const;
