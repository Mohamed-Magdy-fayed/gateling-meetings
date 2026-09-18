import { adminAr } from "@/features/admin/translations/admin-ar";
import { billingAr } from "@/features/billing/translations/billing-ar";
import { integrationsAr } from "@/features/integrations/translations/integrations-ar";
import { legalAr } from "@/features/legal/translations/legal-ar";
import { meetingsAr } from "@/features/meetings/translations/meetings-ar";
import { organizationsAr } from "@/features/organizations/translations/organizations-ar";
import type { LanguageMessages } from "../lib";

export default {
  locale: "ar",
  opposite: "English",
  appName: "Gateling Meetings",
  logoName: "Gateling",
  brand: {
    product: "Meetings",
    company: "Gateling Solutions",
    builtBy: "من تطوير",
    byCompany: "من Gateling Solutions",
    visitSite: "زيارة gateling.com",
  },
  settings: {
    title: "الإعدادات",
    lead: "مؤسستك وخطتها والأنظمة المرتبطة بها.",
    tabs: {
      organization: "المؤسسة",
      billing: "الفوترة",
      integrations: "التكاملات",
    },
  },
  actions: {
    save: "حفظ",
    cancel: "إلغاء",
    delete: "حذف",
    edit: "تعديل",
    create: "إنشاء",
    search: "بحث",
  },
  common: {
    loading: "جاري التحميل...",
    empty: "لا توجد بيانات متاحة.",
    required: "مطلوب",
    yes: "نعم",
    no: "لا",
    confirm: "تأكيد",
    areYouSure: "هل أنت متأكد؟",
    back: "رجوع",
    next: "التالي",
    close: "إغلاق",
    noOptionsFound: "لا توجد خيارات.",
    actions: "الإجراءات",
    createdAt: "تاريخ الإنشاء",
    createdBy: "أُنشئ بواسطة",
    updatedAt: "تاريخ آخر تحديث",
    updatedBy: "حُدِّث بواسطة",
    deletedAt: "تاريخ الحذف",
    deletedBy: "حُذف بواسطة",
  },
  errors: {
    generic: "حدث خطأ ما. يرجى المحاولة مرة أخرى.",
    notFound: "العنصر المطلوب غير موجود.",
    unauthorized: "غير مصرح لك بتنفيذ هذا الإجراء.",
    validationFailed: "يرجى مراجعة الحقول المظللة والمحاولة مرة أخرى.",
  },
  forms: {
    validation: {
      required: "هذا الحقل مطلوب.",
      max32: "يجب ألا يتجاوز 32 حرفًا.",
      max128: "يجب ألا يتجاوز 128 حرفًا.",
      max200: "يجب ألا يتجاوز 200 حرف.",
      max256: "يجب ألا يتجاوز 256 حرفًا.",
      max500: "يجب ألا يتجاوز 500 حرف.",
      max1024: "يجب ألا يتجاوز 1024 حرفًا.",
      max2000: "يجب ألا يتجاوز 2000 حرفًا.",
      max4000: "يجب ألا يتجاوز 4000 حرف.",
      url: "يجب أن يكون رابط ويب يبدأ بـ http:// أو https://.",
    },
    imageUpload: {
      success: "تم رفع الصورة.",
      error: "تعذر رفع الصورة.",
      unsupportedType: "اختر صورة بصيغة JPEG أو PNG أو WebP أو GIF أو AVIF.",
      uploading: "جاري الرفع…",
    },
  },
  languageToggle: "تغيير اللغة",
  themeToggle: "تغيير المظهر",
  auth: {
    emails: {
      common: {
        fromName: "Gateling Meetings",
        defaultRecipientName: "عزيزي المستخدم",
        greeting: "مرحبًا {name}،",
        signature: "— فريق Gateling Meetings",
        minuteSingular: "دقيقة",
        minutePlural: "دقائق",
      },
      emailVerification: {
        subject: "تأكيد عنوان بريدك الإلكتروني",
        text: "مرحبًا {name}، يرجى تأكيد بريدك الإلكتروني خلال {expiryHours} ساعة: {verificationUrl}",
        intro:
          "يرجى تأكيد عنوان بريدك الإلكتروني. تنتهي صلاحية هذا الرابط خلال {expiryHours} ساعة.",
        ctaLabel: "تأكيد البريد الإلكتروني",
        ignore: "إذا لم تقم بإنشاء هذا الحساب، يمكنك تجاهل هذه الرسالة.",
      },
      passwordReset: {
        subject: "رمز إعادة تعيين كلمة المرور",
        text: "مرحبًا {name}، رمز إعادة تعيين كلمة المرور هو {code}. تنتهي صلاحيته خلال {expiresIn} {minutesLabel}.",
        intro:
          "استخدم الرمز أدناه لإعادة تعيين كلمة المرور. تنتهي صلاحيته خلال {expiresIn} {minutesLabel}.",
        ignore: "إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.",
      },
    },
    backToHome: "العودة للرئيسية",
    signOut: "تسجيل الخروج",
    emailPlaceholder: "you@example.com",
    error: {
      badRequest: "طلب غير صالح. يرجى المحاولة مرة أخرى.",
      credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      rateLimited: "محاولات كثيرة جدًا. يرجى المحاولة لاحقًا.",
    },
    validation: {
      required: "هذا الحقل مطلوب.",
      invalidEmail: "أدخل بريدًا إلكترونيًا صالحًا.",
      invalidPhone: "أدخل رقم هاتف صالحًا.",
      passwordRequired: "كلمة المرور مطلوبة.",
      passwordMinLength: "يجب ألا تقل كلمة المرور عن 8 أحرف.",
      passwordLowercase: "يجب أن تحتوي كلمة المرور على حرف صغير.",
      passwordUppercase: "يجب أن تحتوي كلمة المرور على حرف كبير.",
      passwordNumber: "يجب أن تحتوي كلمة المرور على رقم.",
      otpSixDigits: "أدخل الرمز المكوّن من 6 أرقام.",
    },
    signIn: {
      title: "مرحبًا بعودتك",
      description: "سجّل الدخول إلى حساب Gateling Meetings الخاص بك.",
      continueWith: "أو تابع بالبريد الإلكتروني",
      emailLabel: "البريد الإلكتروني",
      continue: "متابعة",
      passwordLabel: "كلمة المرور",
      forgotPassword: "نسيت كلمة المرور؟",
      back: "رجوع",
      submitting: "جاري تسجيل الدخول…",
      submit: "تسجيل الدخول",
      noAccount: "ليس لديك حساب؟",
      toSignUp: "إنشاء حساب",
      hasAccount: "لديك حساب بالفعل؟",
    },
    signUp: {
      title: "أنشئ حسابك",
      description: "استضف اجتماعاتك بنفسك — ابدأ مجانًا.",
      nameLabel: "الاسم الكامل",
      emailLabel: "البريد الإلكتروني",
      phoneLabel: "رقم الهاتف",
      passwordLabel: "كلمة المرور",
      submitting: "جاري إنشاء الحساب…",
      submit: "إنشاء حساب",
      toSignIn: "تسجيل الدخول",
      error: {
        duplicate: "يوجد حساب بالفعل بهذا البريد الإلكتروني.",
        generic: "تعذر إنشاء حسابك. يرجى المحاولة مرة أخرى.",
        sessionFailed:
          "تم إنشاء حسابك، لكن تعذر تسجيل دخولك تلقائيًا. يرجى تسجيل الدخول.",
      },
    },
    oauth: {
      error: {
        failed: "تعذر الاتصال. يرجى المحاولة مرة أخرى.",
      },
    },
    passwordReset: {
      submitting: "جاري إرسال الرمز…",
      submit: "إرسال رمز إعادة التعيين",
      otpLabel: "الرمز المكوّن من 6 أرقام",
      newPasswordLabel: "كلمة المرور الجديدة",
      request: {
        emailError: "تعذر إرسال رمز إعادة التعيين. يرجى المحاولة مرة أخرى.",
      },
      reset: {
        submit: "إعادة تعيين كلمة المرور",
        success: "تمت إعادة تعيين كلمة المرور بنجاح.",
        invalidCode: "هذا الرمز غير صالح أو منتهي الصلاحية.",
        error: "تعذر إعادة تعيين كلمة المرور. يرجى المحاولة مرة أخرى.",
      },
    },
    emailVerification: {
      heading: "تأكيد بريدك الإلكتروني",
      backHome: "العودة للرئيسية",
      alreadyVerifiedNote: "بريدك الإلكتروني مؤكد بالفعل.",
      sent: "تم إرسال رسالة التأكيد.",
      success: { verified: "تم تأكيد بريدك الإلكتروني." },
      passkeyPrompt: {
        setUp: "إعداد مفتاح مرور",
        skip: "تخطي، الانتقال إلى لوحة التحكم",
      },
      notice: {
        missingEmail: "لا يوجد بريد إلكتروني مسجّل لتأكيده.",
        signInRequired: "سجّل الدخول لتأكيد بريدك الإلكتروني.",
        sending: "جاري الإرسال…",
        sendButton: "إعادة إرسال رسالة التأكيد",
      },
      error: {
        missingEmail: "لا يوجد بريد إلكتروني مسجّل لتأكيده.",
        sendFailed: "تعذر إرسال رسالة التأكيد.",
        invalidToken: "رابط التأكيد هذا غير صالح.",
        expired: "انتهت صلاحية رابط التأكيد هذا.",
      },
    },
    passkeys: {
      pageTitle: "مفاتيح المرور",
      pageDescription:
        "إدارة مفاتيح المرور التي يمكنك استخدامها لتسجيل الدخول بدون كلمة مرور.",
      add: "إضافة مفتاح مرور",
      registering: "جاري التسجيل…",
      deleting: "جاري الإزالة…",
      delete: {
        label: "إزالة",
        confirm:
          "إزالة مفتاح المرور هذا؟ قد لا تتمكن من تسجيل الدخول به مرة أخرى.",
        notFound: "مفتاح المرور غير موجود.",
        success: "تمت إزالة مفتاح المرور.",
        error: "تعذر إزالة مفتاح المرور.",
      },
      list: {
        empty: "لا توجد مفاتيح مرور بعد.",
        defaultLabel: "مفتاح مرور",
        created: "أُضيف",
        lastUsed: "آخر استخدام",
      },
      register: {
        unsupported: "مفاتيح المرور غير مدعومة على هذا الجهاز.",
        success: "تم تسجيل مفتاح المرور.",
        cancelled: "تم إلغاء تسجيل مفتاح المرور.",
        error: "تعذر تسجيل مفتاح المرور.",
        invalidChallenge:
          "انتهت صلاحية محاولة التسجيل. يرجى المحاولة مرة أخرى.",
      },
      auth: {
        button: "تسجيل الدخول بمفتاح مرور",
        pending: "جاري تسجيل الدخول…",
        error: {
          emailRequired: "أدخل بريدك الإلكتروني أولاً.",
          unsupported: "مفاتيح المرور غير مدعومة على هذا الجهاز.",
          cancelled: "تم إلغاء تسجيل الدخول بمفتاح المرور.",
          generic: "تعذر تسجيل الدخول بهذا المفتاح.",
          userNotFound: "لا يوجد حساب بهذا البريد الإلكتروني.",
          noCredentials: "لا توجد مفاتيح مرور لهذا الحساب بعد.",
          invalidChallenge:
            "انتهت صلاحية محاولة تسجيل الدخول. يرجى المحاولة مرة أخرى.",
          credentialMismatch: "مفتاح المرور هذا غير مسجّل لهذا الحساب.",
        },
      },
      error: {
        missingRpId: "مفاتيح المرور غير متاحة في هذه البيئة.",
      },
    },
  },
  meetings: meetingsAr,
  integrations: integrationsAr,
  billing: billingAr,
  organizations: organizationsAr,
  admin: adminAr,
  legal: legalAr,
} as const satisfies LanguageMessages;
