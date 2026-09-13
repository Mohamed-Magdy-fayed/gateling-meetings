import { dt } from "@/features/core/i18n/lib";

export const billingAr = {
  plans: {
    free: { name: "مجاني", tagline: "للتجربة." },
    pro: { name: "برو", tagline: "لمن يستضيف الاجتماعات بانتظام." },
    business: { name: "أعمال", tagline: "للفرق والتكاملات." },
  },
  sources: {
    free: "مجاني",
    subscription: "اشتراك",
    manual: "ممنوح",
    trial: "تجريبي",
  },
  features: {
    participants: "حتى {max:number} مشارك",
    minutes: "اجتماعات حتى {max:number} دقيقة",
    hours: "اجتماعات حتى {max:number} ساعة",
    unlimitedDuration: "مدة اجتماع غير محدودة",
    upcoming: "حتى {max:number} اجتماعات مجدولة قادمة",
    unlimitedUpcoming: "اجتماعات مجدولة غير محدودة",
    breakouts: "غرف فرعية",
    apiAccess: "وصول API وWebhooks وروابط انضمام SSO",
    seats: "تسعير لكل مقعد لفريقك",
  },
  limits: {
    participants: "هذا الاجتماع ممتلئ — تسمح خطته بـ {max:number} مشارك.",
    minutes: "تسمح هذه الخطة باجتماعات حتى {max:number} دقيقة.",
    upcoming:
      "تسمح هذه الخطة بـ {max:number} اجتماعات مجدولة قادمة. أنهِ أو احذف أحدها، أو قم بالترقية.",
    breakouts: "الغرف الفرعية غير مشمولة في هذه الخطة.",
    apiAccess: "وصول API غير مشمول في هذه الخطة.",
    seats: "جميع المقاعد في هذه المؤسسة مشغولة.",
  },
  room: {
    endingSoon: "سينتهي هذا الاجتماع خلال 5 دقائق (حد الخطة).",
    endsIn: "ينتهي الاجتماع خلال {time}",
    cappedBy: "حد الخطة المجانية",
    upgrade: "ترقية",
  },
  settings: {
    title: "الخطة والفوترة",
    lead: "ما تستخدمه {name} حاليًا وما يتيحه ذلك.",
    currentPlan: "الخطة الحالية",
    participants: "المشاركون لكل اجتماع",
    duration: "مدة الاجتماع",
    upcoming: "الاجتماعات المجدولة القادمة",
    seats: "المقاعد",
    api: "وصول API",
    unlimited: "غير محدود",
    minutes: dt("{count:plural}", {
      plural: {
        count: {
          zero: "لا دقائق",
          one: "دقيقة واحدة",
          two: "دقيقتان",
          few: "{?} دقائق",
          many: "{?} دقيقة",
          other: "{?} دقيقة",
        },
      },
    }),
    comparePlans: "قارن الخطط",
  },
  pricing: {
    nav: "الأسعار",
    title: "تسعير بسيط",
    lead: "ابدأ مجانًا. قم بالترقية عندما تحتاج اجتماعات أطول أو مشاركين أكثر أو الـ API.",
    perSeat: "لكل مقعد / شهريًا",
    free: "مجاني دائمًا",
    current: "الخطة الحالية",
    getStarted: "ابدأ الآن",
    upgrade: "ترقية",
    manage: "إدارة الفوترة",
    contact: "تواصل معنا",
    contactLead: "تحتاج حدودًا مخصصة أو فاتورة؟ يمكننا إعداد مؤسستك يدويًا.",
  },
} as const;
