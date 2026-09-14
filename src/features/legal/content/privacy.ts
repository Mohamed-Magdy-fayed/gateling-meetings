import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY,
  type LegalDocuments,
} from "./types";

const E = LEGAL_ENTITY;

export const privacyDocuments: LegalDocuments = {
  en: {
    title: "Privacy Policy",
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro: [
      `This policy describes what personal data ${E.name}, ${E.country} ("we") collects when you use ${E.product} at ${E.productUrl} (the "Service"), why, who we share it with and what rights you have. We are the controller of this data. Paddle, our Merchant of Record, is a separate controller for the payment data it collects at checkout — see paddle.com/legal/privacy.`,
    ],
    sections: [
      {
        heading: "1. Data we collect",
        paragraphs: [],
        groups: [
          {
            label: "Account and organization data you give us:",
            bullets: [
              "name, email address and phone number when you sign up; a password (stored only as a hash) or a passkey (we store only the public key); your Google account's name, email and profile picture if you sign in with Google;",
              "organization names, the members and roles you set up, and the email addresses you invite;",
              "your plan, seat count and — once you buy a plan — the identifiers Paddle assigns to your customer and subscription. We never receive or store card numbers.",
            ],
          },
          {
            label: "Meeting data:",
            bullets: [
              "meeting titles, scheduled times, durations, invitee email addresses and meeting codes;",
              "for each participant, including guests without an account: the display name they enter, when they joined and left, whether they were admitted from the waiting room, and breakout-room assignments;",
              "audio, video, screen shares, chat messages and reactions are relayed between participants in real time through our media provider and are not recorded or stored by us. If a host or participant records with their own tools, that recording is theirs and outside this policy.",
            ],
          },
          {
            label: "Technical data collected automatically:",
            bullets: [
              "IP address, browser and device type, language, and the pages and actions you use, in server logs kept for up to 30 days;",
              "cookies: a session cookie that keeps you signed in and a cookie that remembers your language. We do not use advertising or cross-site tracking cookies.",
            ],
          },
        ],
      },
      {
        heading: "2. Why we use it",
        paragraphs: ["We process personal data:"],
        bullets: [
          "to provide the Service — create accounts, run meetings, admit participants, enforce plan limits, send invitations and reminders (performance of our contract with you);",
          "to bill you and prevent fraud and abuse (contract and our legitimate interests);",
          "to keep the Service secure and reliable — rate limiting, logs, incident investigation (legitimate interests);",
          "to send you service emails such as verification, invitations and billing notices. We do not send marketing email without your consent;",
          "to comply with law, including tax and accounting obligations.",
        ],
      },
      {
        heading: "3. Who we share it with",
        paragraphs: [
          "We share personal data only with processors that help us run the Service, under contracts that restrict them to our instructions:",
        ],
        bullets: [
          "Vercel (application hosting, logs) — United States and edge locations worldwide;",
          "Neon (database) and Upstash (session store) — United States / EU regions;",
          "LiveKit (real-time audio, video and chat relay) — global media servers close to participants;",
          "Paddle (checkout, payment, invoices, tax) — United Kingdom / United States; Paddle receives your name, email, country and what you bought;",
          "Inngest (background jobs such as reminders and duration limits);",
          "Google (only if you sign in with Google);",
          "our email delivery provider (for the transactional emails above).",
        ],
        after: [
          "Meeting participants see each other's display names, and the host sees participants' join and leave times. Members of an organization can see each other's names and email addresses. We do not sell personal data and do not share it with advertisers.",
          "We may disclose data when required by law, to protect someone's safety, or to enforce our Terms.",
        ],
      },
      {
        heading: "4. International transfers",
        paragraphs: [
          "We are based in Egypt and our processors operate in the United States, the European Union, the United Kingdom and elsewhere. Where data leaves the EEA or UK, we rely on the processor's standard contractual clauses or an adequacy decision.",
        ],
      },
      {
        heading: "5. How long we keep it",
        paragraphs: [],
        bullets: [
          "Account and organization data: until you delete your account, then removed within 30 days except as noted below;",
          "Meetings and participant records: until you delete the meeting or your account;",
          "Billing records: as long as tax and accounting law requires;",
          "Server logs: up to 30 days;",
          "Billing event records from Paddle: as long as needed to handle disputes and meet accounting obligations.",
        ],
      },
      {
        heading: "6. Your rights",
        paragraphs: [
          `You can access and correct most of your data in the Service. You may also ask us to access, correct, delete, export or restrict your personal data, or object to processing based on legitimate interests, by emailing ${E.email}. We answer within 30 days. If you are in the EEA or UK you may also complain to your data-protection authority; in Egypt, the Personal Data Protection Center under Law No. 151 of 2020.`,
          "Deleting your account removes your personal organization and the meetings you host; team organizations you own must first be transferred or deleted.",
        ],
      },
      {
        heading: "7. Security",
        paragraphs: [
          "All traffic is encrypted in transit (HTTPS / WSS, and media is encrypted between participants and our media servers). Passwords are hashed, API keys are stored hashed and shown once, and sessions expire. No system is perfectly secure; if we learn of a breach affecting you we will notify you and the relevant authority as the law requires.",
        ],
      },
      {
        heading: "8. Children",
        paragraphs: [
          "The Service is not directed at children under 16 and we do not knowingly collect their data. Guests of any age may join a meeting a host invites them to; the host is responsible for that invitation.",
        ],
      },
      {
        heading: "9. Changes",
        paragraphs: [
          "We may update this policy. Material changes are announced by email or in the Service at least 14 days before they take effect.",
        ],
      },
      {
        heading: "10. Contact",
        paragraphs: [`${E.name}, ${E.country} — ${E.email} — ${E.site}.`],
      },
    ],
  },
  ar: {
    title: "سياسة الخصوصية",
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro: [
      `توضح هذه السياسة البيانات الشخصية التي تجمعها ${E.name}، ${E.country} ("نحن") عند استخدامك لـ ${E.product} على ${E.productUrl} ("الخدمة")، ولماذا، ومع من نشاركها، وما حقوقك. نحن المتحكم في هذه البيانات. أما Paddle، التاجر المسجَّل لدينا، فهي متحكم مستقل في بيانات الدفع التي تجمعها عند الشراء — انظر paddle.com/legal/privacy.`,
    ],
    sections: [
      {
        heading: "1. البيانات التي نجمعها",
        paragraphs: [],
        groups: [
          {
            label: "بيانات الحساب والمؤسسة التي تقدمها لنا:",
            bullets: [
              "الاسم والبريد الإلكتروني ورقم الهاتف عند التسجيل؛ وكلمة مرور (تُخزَّن كتجزئة فقط) أو مفتاح مرور (نخزّن المفتاح العام فقط)؛ واسم حساب Google وبريده وصورته إذا سجّلت الدخول عبر Google؛",
              "أسماء المؤسسات، والأعضاء والأدوار التي تحددها، وعناوين البريد التي تدعوها؛",
              "خطتك وعدد المقاعد — وبعد شراء خطة — المعرّفات التي تخصصها Paddle لعميلك واشتراكك. لا نستلم أرقام البطاقات ولا نخزّنها أبدًا.",
            ],
          },
          {
            label: "بيانات الاجتماعات:",
            bullets: [
              "عناوين الاجتماعات، والأوقات المجدولة، والمدد، وعناوين بريد المدعوين، ورموز الاجتماعات؛",
              "لكل مشارك، بما في ذلك الضيوف دون حساب: الاسم الذي يدخله، ووقت الانضمام والمغادرة، وما إذا سُمح له بالدخول من غرفة الانتظار، وتوزيع الغرف الفرعية؛",
              "يُنقل الصوت والفيديو ومشاركة الشاشة ورسائل الدردشة والتفاعلات بين المشاركين في الوقت الفعلي عبر مزود الوسائط لدينا ولا نسجّلها أو نخزّنها. إذا سجّل مضيف أو مشارك بأدواته الخاصة، فذلك التسجيل ملكه وخارج نطاق هذه السياسة.",
            ],
          },
          {
            label: "بيانات تقنية تُجمع تلقائيًا:",
            bullets: [
              "عنوان IP، ونوع المتصفح والجهاز، واللغة، والصفحات والإجراءات التي تستخدمها، في سجلات الخادم المحفوظة لمدة تصل إلى 30 يومًا؛",
              "ملفات تعريف الارتباط: ملف جلسة يُبقيك مسجَّل الدخول وملف يتذكر لغتك. لا نستخدم ملفات إعلانية أو تتبع عبر المواقع.",
            ],
          },
        ],
      },
      {
        heading: "2. لماذا نستخدمها",
        paragraphs: ["نعالج البيانات الشخصية:"],
        bullets: [
          "لتقديم الخدمة — إنشاء الحسابات، وتشغيل الاجتماعات، وقبول المشاركين، وفرض حدود الخطة، وإرسال الدعوات والتذكيرات (تنفيذ عقدنا معك)؛",
          "لإصدار الفواتير ومنع الاحتيال وإساءة الاستخدام (العقد ومصالحنا المشروعة)؛",
          "للحفاظ على أمان الخدمة وموثوقيتها — تحديد المعدل، والسجلات، والتحقيق في الحوادث (المصالح المشروعة)؛",
          "لإرسال رسائل الخدمة مثل التحقق والدعوات وإشعارات الفوترة. لا نرسل رسائل تسويقية دون موافقتك؛",
          "للامتثال للقانون، بما في ذلك الالتزامات الضريبية والمحاسبية.",
        ],
      },
      {
        heading: "3. مع من نشاركها",
        paragraphs: [
          "نشارك البيانات الشخصية فقط مع معالجين يساعدوننا في تشغيل الخدمة، بموجب عقود تقصرهم على تعليماتنا:",
        ],
        bullets: [
          "Vercel (استضافة التطبيق، السجلات) — الولايات المتحدة ومواقع طرفية حول العالم؛",
          "Neon (قاعدة البيانات) وUpstash (مخزن الجلسات) — مناطق الولايات المتحدة / الاتحاد الأوروبي؛",
          "LiveKit (نقل الصوت والفيديو والدردشة في الوقت الفعلي) — خوادم وسائط عالمية قريبة من المشاركين؛",
          "Paddle (الدفع، الفواتير، الضرائب) — المملكة المتحدة / الولايات المتحدة؛ تستلم Paddle اسمك وبريدك وبلدك وما اشتريته؛",
          "Inngest (المهام الخلفية مثل التذكيرات وحدود المدة)؛",
          "Google (فقط إذا سجّلت الدخول عبر Google)؛",
          "مزود توصيل البريد الإلكتروني لدينا (لرسائل المعاملات المذكورة أعلاه).",
        ],
        after: [
          "يرى المشاركون في الاجتماع أسماء بعضهم البعض، ويرى المضيف أوقات انضمام المشاركين ومغادرتهم. يمكن لأعضاء المؤسسة رؤية أسماء وعناوين بريد بعضهم البعض. لا نبيع البيانات الشخصية ولا نشاركها مع المعلنين.",
          "قد نفصح عن البيانات عندما يقتضي القانون ذلك، أو لحماية سلامة شخص ما، أو لإنفاذ شروطنا.",
        ],
      },
      {
        heading: "4. النقل الدولي",
        paragraphs: [
          "مقرنا في مصر ويعمل معالجونا في الولايات المتحدة والاتحاد الأوروبي والمملكة المتحدة وغيرها. عندما تغادر البيانات المنطقة الاقتصادية الأوروبية أو المملكة المتحدة، نعتمد على البنود التعاقدية القياسية للمعالج أو قرار كفاية.",
        ],
      },
      {
        heading: "5. مدة الاحتفاظ",
        paragraphs: [],
        bullets: [
          "بيانات الحساب والمؤسسة: حتى تحذف حسابك، ثم تُزال خلال 30 يومًا باستثناء ما هو مذكور أدناه؛",
          "الاجتماعات وسجلات المشاركين: حتى تحذف الاجتماع أو حسابك؛",
          "سجلات الفوترة: طوال المدة التي يقتضيها القانون الضريبي والمحاسبي؛",
          "سجلات الخادم: حتى 30 يومًا؛",
          "سجلات أحداث الفوترة من Paddle: طوال المدة اللازمة لمعالجة النزاعات والوفاء بالالتزامات المحاسبية.",
        ],
      },
      {
        heading: "6. حقوقك",
        paragraphs: [
          `يمكنك الوصول إلى معظم بياناتك وتصحيحها داخل الخدمة. يمكنك أيضًا أن تطلب منا الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها أو تصديرها أو تقييدها، أو الاعتراض على المعالجة القائمة على المصالح المشروعة، بمراسلة ${E.email}. نرد خلال 30 يومًا. إذا كنت في المنطقة الاقتصادية الأوروبية أو المملكة المتحدة يمكنك أيضًا تقديم شكوى إلى هيئة حماية البيانات لديك؛ وفي مصر، إلى مركز حماية البيانات الشخصية بموجب القانون رقم 151 لسنة 2020.`,
          "يؤدي حذف حسابك إلى إزالة مؤسستك الشخصية والاجتماعات التي تستضيفها؛ أما مؤسسات الفريق التي تملكها فيجب نقلها أو حذفها أولًا.",
        ],
      },
      {
        heading: "7. الأمان",
        paragraphs: [
          "تُشفَّر جميع حركة المرور أثناء النقل (HTTPS / WSS، وتُشفَّر الوسائط بين المشاركين وخوادم الوسائط لدينا). تُجزَّأ كلمات المرور، وتُخزَّن مفاتيح الـ API مجزَّأة وتُعرض مرة واحدة، وتنتهي صلاحية الجلسات. لا يوجد نظام آمن تمامًا؛ وإذا علمنا باختراق يؤثر عليك فسنخطرك والجهة المختصة كما يقتضي القانون.",
        ],
      },
      {
        heading: "8. الأطفال",
        paragraphs: [
          "الخدمة غير موجهة للأطفال دون 16 عامًا ولا نجمع بياناتهم عن علم. يمكن لضيوف من أي عمر الانضمام إلى اجتماع يدعوهم إليه مضيف؛ والمضيف مسؤول عن تلك الدعوة.",
        ],
      },
      {
        heading: "9. التغييرات",
        paragraphs: [
          "يجوز لنا تحديث هذه السياسة. يُعلن عن التغييرات الجوهرية بالبريد الإلكتروني أو داخل الخدمة قبل 14 يومًا على الأقل من سريانها.",
        ],
      },
      {
        heading: "10. التواصل",
        paragraphs: [`${E.name}، ${E.country} — ${E.email} — ${E.site}.`],
      },
    ],
  },
};
