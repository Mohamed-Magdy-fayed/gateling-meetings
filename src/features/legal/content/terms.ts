import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY,
  type LegalDocuments,
} from "./types";

const E = LEGAL_ENTITY;

export const termsDocuments: LegalDocuments = {
  en: {
    title: "Terms of Service",
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro: [
      `These Terms of Service ("Terms") govern your use of ${E.product}, the video-meeting service available at ${E.productUrl} (the "Service"), operated by ${E.name}, ${E.country} ("${E.name}", "we", "us"). By creating an account, hosting or joining a meeting, or otherwise using the Service, you agree to these Terms. If you use the Service on behalf of an organization, you confirm you are authorized to bind that organization, and "you" includes it.`,
      `Paid plans are sold by ${E.name}, ${E.country}. Payments are processed on our behalf by Paymob (Paymob Solutions S.A.E., Egypt, "Paymob"), a licensed payment service provider: Paymob takes your card details on its own hosted page, keeps a secure token of your card for renewals, and never shares the card number with us. Prices are in Egyptian pounds (EGP). Refunds are issued by us through Paymob under our Refund and Cancellation Policy.`,
    ],
    sections: [
      {
        heading: "1. The Service",
        paragraphs: [
          "The Service lets registered users host video meetings — instant or scheduled — and lets anyone with a meeting code or link join as a guest without an account. Features include audio and video, screen sharing, in-meeting chat, reactions, hand-raising, a waiting room, breakout rooms and, on eligible plans, an integration API.",
          "The Service does not record meetings. Audio, video and chat are relayed in real time between participants and are not stored by us. Participants may of course use their own tools to record; you are responsible for complying with recording and consent laws that apply to you.",
        ],
      },
      {
        heading: "2. Accounts",
        paragraphs: [
          "You must be at least 16 years old to create an account. You must give accurate details, keep them up to date, and keep your credentials (password, passkeys, connected Google account) secure. You are responsible for everything done through your account until you tell us it has been compromised.",
          "Guests joining a meeting by code do not need an account. Hosts are responsible for who they admit to their meetings.",
        ],
      },
      {
        heading: "3. Organizations, plans and seats",
        paragraphs: [
          "Every account has a personal organization; you may also create team organizations and invite members. A plan (Free, Pro or Business) applies to an organization and sets its limits — for example the number of participants per meeting, meeting duration, upcoming scheduled meetings, breakout rooms and API access. The current limits of each plan are listed on our pricing page and enforced by the Service.",
          "Paid plans are priced per seat. A seat is consumed by each member of the organization and each pending invitation. Owners and admins may add seats at any time and reduce them to no fewer than the current number of members.",
          "We may grant a plan to an organization by hand — for example for a pilot, a partner or a trial — with or without an expiry date. Such a grant is not a purchase, carries no payment obligation, may be changed or withdrawn by us, and is not overwritten by a later paid subscription unless we say so.",
        ],
      },
      {
        heading: "4. Fees, billing and renewals",
        paragraphs: [
          "Prices are shown on our pricing page and at checkout in Egyptian pounds and include Egyptian value-added tax where it applies. Subscriptions renew automatically at the end of each billing period (every 30 days for monthly plans, every 360 days for yearly plans) by charging the card saved with Paymob, at the then-current price, until cancelled.",
          "Adding seats makes them available immediately; the new seat total is charged from your next renewal — there is no prorated charge mid-period. Reducing seats also takes effect at the next renewal. Cancelling stops all future charges at once; the organization keeps its plan until the end of the period already paid for. Refunds are governed by our Refund and Cancellation Policy.",
          "If a renewal payment fails, Paymob retries it over the following days and you are notified. If it is not settled within seven days of the period end, the organization returns to the Free plan and its limits apply immediately. Your data is not deleted; you can resubscribe at any time.",
          "We may change prices. Changes take effect at your next renewal after we give at least 30 days' notice by email or in the Service.",
        ],
      },
      {
        heading: "5. Acceptable use",
        paragraphs: [
          "You may use the Service only lawfully and for its intended purpose. You must not:",
        ],
        bullets: [
          "use the Service to harass, threaten, defame or harm anyone, or to distribute unlawful, infringing or sexually exploitative material;",
          "join or attempt to join meetings you were not invited to, or circumvent a waiting room, participant limit or other control;",
          "interfere with the Service, probe or test its security without written permission, scrape it, or use it to build a competing service;",
          "share your API key or use the API beyond your plan's limits or to send unsolicited messages;",
          "impersonate any person or organization, or misrepresent your affiliation.",
        ],
        after: [
          "We may suspend or end meetings, accounts or organizations that breach these Terms, and remove content that is unlawful or harmful, with notice where practical.",
        ],
      },
      {
        heading: "6. Your content",
        paragraphs: [
          "You own the content you bring to the Service (meeting titles, names, invitee lists, chat messages, shared screens and media). You grant us only the rights needed to operate the Service — to relay, display and process that content for you and your participants. We do not use your meeting content to train models or for advertising.",
          "You are responsible for having the rights and consents needed for anything you share, including the consent of people you invite and of anyone whose personal data you bring into a meeting.",
        ],
      },
      {
        heading: "7. Integrations and API",
        paragraphs: [
          "Organizations on an eligible plan may create API keys to let other systems create meetings and mint join links. API use is subject to the documented limits, to reasonable rate limits and to these Terms. Keys are shown once; you must store them securely and rotate them if exposed. If the organization's plan no longer includes API access, requests are refused until it does, but keys are not deleted.",
        ],
      },
      {
        heading: "8. Availability and changes",
        paragraphs: [
          "We aim to keep the Service available at all times but do not promise uninterrupted or error-free operation. We may change, add or remove features, and we may impose or change limits on the Free plan. We will not materially reduce what a paid plan includes during a period you have already paid for without offering a prorated refund.",
        ],
      },
      {
        heading: "9. Termination",
        paragraphs: [
          "You may stop using the Service at any time, cancel a subscription from the billing page, or ask us to delete your account by emailing us. We may suspend or terminate your access for breach of these Terms, for non-payment, if required by law, or if we discontinue the Service — in the last case with at least 30 days' notice and a prorated refund of any prepaid, unused period.",
          "Sections 6, 10, 11 and 13 survive termination.",
        ],
      },
      {
        heading: "10. Disclaimers",
        paragraphs: [
          `The Service is provided "as is" and "as available". To the fullest extent permitted by law, ${E.name} disclaims all warranties, express or implied, including fitness for a particular purpose and non-infringement. Video and audio quality depend on your and your participants' devices and networks, which we do not control.`,
        ],
      },
      {
        heading: "11. Limitation of liability",
        paragraphs: [
          `To the fullest extent permitted by law, ${E.name} is not liable for indirect, incidental, special, consequential or punitive damages, or for lost profits, revenue, data or goodwill, arising from or related to the Service. Our total liability for all claims in any twelve-month period is limited to the amount you paid us for the Service in that period, or USD 100 if you paid nothing. Nothing in these Terms limits liability that cannot be limited by law, including for fraud or for death or personal injury caused by negligence.`,
        ],
      },
      {
        heading: "12. Consumers",
        paragraphs: [
          "If you are a consumer, you have rights under the mandatory consumer-protection laws of your country of residence that these Terms do not reduce. Where these Terms conflict with such rights, the rights prevail.",
        ],
      },
      {
        heading: "13. Governing law and disputes",
        paragraphs: [
          `These Terms are governed by the laws of the Arab Republic of Egypt, and the courts of Cairo have exclusive jurisdiction, except that consumers may also rely on the courts and laws of their country of residence where the law gives them that right. Before starting any proceeding, please contact us at ${E.email}; most issues can be settled quickly.`,
        ],
      },
      {
        heading: "14. Changes to these Terms",
        paragraphs: [
          "We may update these Terms. For material changes we will give at least 14 days' notice by email or in the Service before they take effect. Continuing to use the Service after that date means you accept the updated Terms; if you do not, cancel and stop using the Service before then.",
        ],
      },
      {
        heading: "15. Contact",
        paragraphs: [
          `${E.name}, ${E.country} — ${E.email} — ${E.site}. Questions about a charge, receipt or refund go to the same address; Paymob only processes the payment and cannot change your plan.`,
        ],
      },
    ],
  },
  ar: {
    title: "شروط الخدمة",
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro: [
      `تحكم شروط الخدمة هذه ("الشروط") استخدامك لـ ${E.product}، خدمة الاجتماعات المرئية المتاحة على ${E.productUrl} ("الخدمة")، والتي تشغّلها ${E.name}، ${E.country} ("${E.name}"، "نحن"). بإنشاء حساب أو استضافة اجتماع أو الانضمام إليه أو استخدام الخدمة بأي شكل آخر، فإنك توافق على هذه الشروط. إذا كنت تستخدم الخدمة نيابةً عن مؤسسة، فإنك تؤكد أنك مخوَّل بإلزامها، وتشمل كلمة "أنت" تلك المؤسسة.`,
      `تُباع الخطط المدفوعة من ${E.name}، ${E.country}. تُعالَج المدفوعات نيابةً عنا عبر Paymob (شركة Paymob Solutions S.A.E.، مصر، "Paymob")، مزوّد خدمات دفع مرخَّص: تستقبل Paymob بيانات بطاقتك على صفحتها المستضافة، وتحتفظ برمز آمن للبطاقة لأغراض التجديد، ولا تشاركنا رقم البطاقة أبدًا. الأسعار بالجنيه المصري. نُصدر عمليات الاسترداد بأنفسنا عبر Paymob وفق سياسة الاسترداد والإلغاء الخاصة بنا.`,
    ],
    sections: [
      {
        heading: "1. الخدمة",
        paragraphs: [
          "تتيح الخدمة للمستخدمين المسجَّلين استضافة اجتماعات مرئية — فورية أو مجدولة — وتتيح لأي شخص يملك رمز الاجتماع أو رابطه الانضمام كضيف دون حساب. تشمل الميزات الصوت والفيديو، ومشاركة الشاشة، والدردشة داخل الاجتماع، والتفاعلات، ورفع اليد، وغرفة الانتظار، والغرف الفرعية، وواجهة برمجة تطبيقات (API) للتكامل في الخطط المؤهلة.",
          "لا تسجّل الخدمة الاجتماعات. يُنقل الصوت والفيديو والدردشة في الوقت الفعلي بين المشاركين ولا نخزّنها. قد يستخدم المشاركون أدواتهم الخاصة للتسجيل؛ وأنت مسؤول عن الامتثال لقوانين التسجيل والموافقة المطبقة عليك.",
        ],
      },
      {
        heading: "2. الحسابات",
        paragraphs: [
          "يجب ألا يقل عمرك عن 16 عامًا لإنشاء حساب. يجب أن تقدم بيانات صحيحة وتحدّثها، وأن تحافظ على سرية بيانات الدخول (كلمة المرور، مفاتيح المرور، حساب Google المرتبط). أنت مسؤول عن كل ما يتم عبر حسابك حتى تبلغنا باختراقه.",
          "لا يحتاج الضيوف المنضمون برمز الاجتماع إلى حساب. المضيف مسؤول عمّن يسمح لهم بدخول اجتماعاته.",
        ],
      },
      {
        heading: "3. المؤسسات والخطط والمقاعد",
        paragraphs: [
          "لكل حساب مؤسسة شخصية؛ ويمكنك أيضًا إنشاء مؤسسات فريق ودعوة أعضاء. تُطبَّق الخطة (مجاني، Pro أو Business) على المؤسسة وتحدد حدودها — مثل عدد المشاركين في الاجتماع، ومدة الاجتماع، وعدد الاجتماعات المجدولة القادمة، والغرف الفرعية، والوصول إلى الـ API. الحدود الحالية لكل خطة مذكورة في صفحة الأسعار وتفرضها الخدمة.",
          "تُسعَّر الخطط المدفوعة لكل مقعد. يشغل كل عضو في المؤسسة وكل دعوة معلّقة مقعدًا. يمكن للمالكين والمشرفين إضافة مقاعد في أي وقت وتقليلها بما لا يقل عن عدد الأعضاء الحاليين.",
          "قد نمنح خطة لمؤسسة يدويًا — مثلًا لتجربة أو شريك أو فترة تجريبية — بتاريخ انتهاء أو بدونه. لا يُعد هذا المنح شراءً، ولا يترتب عليه أي التزام بالدفع، ويجوز لنا تغييره أو سحبه، ولا يُستبدل باشتراك مدفوع لاحق ما لم نقرر ذلك.",
        ],
      },
      {
        heading: "4. الرسوم والفوترة والتجديد",
        paragraphs: [
          "تُعرض الأسعار في صفحة الأسعار وعند الدفع بالجنيه المصري، وتشمل ضريبة القيمة المضافة المصرية حيثما تنطبق. تتجدد الاشتراكات تلقائيًا في نهاية كل فترة فوترة (كل 30 يومًا للخطط الشهرية وكل 360 يومًا للخطط السنوية) بالخصم من البطاقة المحفوظة لدى Paymob بالسعر الساري حينها، حتى يتم الإلغاء.",
          "تصبح المقاعد المضافة متاحة فورًا؛ ويُخصم إجمالي المقاعد الجديد بدءًا من التجديد التالي — لا يوجد خصم تناسبي في منتصف الفترة. يسري تقليل المقاعد أيضًا عند التجديد التالي. يوقف الإلغاء جميع الخصومات المستقبلية فورًا؛ وتحتفظ المؤسسة بخطتها حتى نهاية الفترة المدفوعة بالفعل. يخضع الاسترداد لسياسة الاسترداد والإلغاء الخاصة بنا.",
          "إذا فشل خصم التجديد، تعيد Paymob المحاولة خلال الأيام التالية ويتم إخطارك. إذا لم يُسدَّد خلال سبعة أيام من نهاية الفترة، تعود المؤسسة إلى الخطة المجانية وتُطبَّق حدودها فورًا. لا تُحذف بياناتك؛ ويمكنك إعادة الاشتراك في أي وقت.",
          "يجوز لنا تغيير الأسعار. تسري التغييرات عند التجديد التالي بعد إشعار لا يقل عن 30 يومًا بالبريد الإلكتروني أو داخل الخدمة.",
        ],
      },
      {
        heading: "5. الاستخدام المقبول",
        paragraphs: [
          "يجوز لك استخدام الخدمة بشكل قانوني فقط وللغرض المخصص لها. يجب ألا:",
        ],
        bullets: [
          "تستخدم الخدمة للمضايقة أو التهديد أو التشهير أو إيذاء أي شخص، أو لتوزيع مواد غير قانونية أو منتهِكة للحقوق أو استغلالية جنسيًا؛",
          "تنضم أو تحاول الانضمام إلى اجتماعات لم تُدعَ إليها، أو تتحايل على غرفة الانتظار أو حد المشاركين أو أي ضابط آخر؛",
          "تتدخل في الخدمة، أو تفحص أو تختبر أمانها دون إذن كتابي، أو تجمع بياناتها آليًا، أو تستخدمها لبناء خدمة منافسة؛",
          "تشارك مفتاح الـ API الخاص بك أو تستخدم الـ API بما يتجاوز حدود خطتك أو لإرسال رسائل غير مرغوب فيها؛",
          "تنتحل شخصية أي شخص أو مؤسسة، أو تقدّم معلومات مضللة عن انتمائك.",
        ],
        after: [
          "يجوز لنا تعليق أو إنهاء الاجتماعات أو الحسابات أو المؤسسات التي تخالف هذه الشروط، وإزالة المحتوى غير القانوني أو الضار، مع الإشعار حيثما أمكن.",
        ],
      },
      {
        heading: "6. محتواك",
        paragraphs: [
          "أنت تملك المحتوى الذي تجلبه إلى الخدمة (عناوين الاجتماعات، الأسماء، قوائم المدعوين، رسائل الدردشة، الشاشات والوسائط المشتركة). تمنحنا فقط الحقوق اللازمة لتشغيل الخدمة — لنقل هذا المحتوى وعرضه ومعالجته لك ولمشاركيك. لا نستخدم محتوى اجتماعاتك لتدريب النماذج أو للإعلانات.",
          "أنت مسؤول عن امتلاك الحقوق والموافقات اللازمة لأي شيء تشاركه، بما في ذلك موافقة من تدعوهم وأي شخص تجلب بياناته الشخصية إلى الاجتماع.",
        ],
      },
      {
        heading: "7. التكاملات والـ API",
        paragraphs: [
          "يمكن للمؤسسات على خطة مؤهلة إنشاء مفاتيح API للسماح لأنظمة أخرى بإنشاء اجتماعات وتوليد روابط انضمام. يخضع استخدام الـ API للحدود الموثّقة ولحدود معدل معقولة ولهذه الشروط. تُعرض المفاتيح مرة واحدة؛ ويجب تخزينها بأمان وتدويرها إذا تسرّبت. إذا لم تعد خطة المؤسسة تشمل الوصول إلى الـ API، تُرفض الطلبات حتى تشمله مجددًا، لكن لا تُحذف المفاتيح.",
        ],
      },
      {
        heading: "8. التوافر والتغييرات",
        paragraphs: [
          "نسعى لإبقاء الخدمة متاحة على الدوام لكننا لا نعد بتشغيل دون انقطاع أو خالٍ من الأخطاء. يجوز لنا تغيير الميزات أو إضافتها أو إزالتها، وفرض حدود على الخطة المجانية أو تغييرها. لن نقلّص جوهريًا ما تشمله خطة مدفوعة خلال فترة دفعتها بالفعل دون عرض استرداد تناسبي.",
        ],
      },
      {
        heading: "9. الإنهاء",
        paragraphs: [
          "يمكنك التوقف عن استخدام الخدمة في أي وقت، أو إلغاء الاشتراك من صفحة الفوترة، أو طلب حذف حسابك بمراسلتنا. يجوز لنا تعليق أو إنهاء وصولك عند مخالفة هذه الشروط، أو عدم الدفع، أو إذا اقتضى القانون ذلك، أو إذا أوقفنا الخدمة — وفي الحالة الأخيرة بإشعار لا يقل عن 30 يومًا واسترداد تناسبي لأي فترة مدفوعة مسبقًا لم تُستخدم.",
          "تظل الأقسام 6 و10 و11 و13 سارية بعد الإنهاء.",
        ],
      },
      {
        heading: "10. إخلاء المسؤولية",
        paragraphs: [
          `تُقدَّم الخدمة "كما هي" و"حسب التوافر". إلى أقصى حد يسمح به القانون، تُخلي ${E.name} مسؤوليتها عن جميع الضمانات، الصريحة أو الضمنية، بما في ذلك الملاءمة لغرض معين وعدم الانتهاك. تعتمد جودة الفيديو والصوت على أجهزتك وأجهزة مشاركيك وشبكاتكم، وهي أمور لا نتحكم فيها.`,
        ],
      },
      {
        heading: "11. تحديد المسؤولية",
        paragraphs: [
          `إلى أقصى حد يسمح به القانون، لا تتحمل ${E.name} المسؤولية عن الأضرار غير المباشرة أو العرضية أو الخاصة أو التبعية أو التأديبية، أو عن خسارة الأرباح أو الإيرادات أو البيانات أو السمعة، الناشئة عن الخدمة أو المتعلقة بها. تقتصر مسؤوليتنا الإجمالية عن جميع المطالبات في أي فترة اثني عشر شهرًا على المبلغ الذي دفعته لنا مقابل الخدمة في تلك الفترة، أو 100 دولار أمريكي إذا لم تدفع شيئًا. لا شيء في هذه الشروط يحدّ من مسؤولية لا يجيز القانون تحديدها، بما في ذلك الاحتيال أو الوفاة أو الإصابة الشخصية الناتجة عن الإهمال.`,
        ],
      },
      {
        heading: "12. المستهلكون",
        paragraphs: [
          "إذا كنت مستهلكًا، فلك حقوق بموجب قوانين حماية المستهلك الإلزامية في بلد إقامتك لا تنتقص منها هذه الشروط. وحيثما تتعارض هذه الشروط مع تلك الحقوق، تسود الحقوق.",
        ],
      },
      {
        heading: "13. القانون الحاكم والنزاعات",
        paragraphs: [
          `تخضع هذه الشروط لقوانين جمهورية مصر العربية، وتختص محاكم القاهرة حصريًا بالنظر في النزاعات، باستثناء أنه يجوز للمستهلكين الاعتماد أيضًا على محاكم وقوانين بلد إقامتهم حيث يمنحهم القانون ذلك الحق. قبل بدء أي إجراء، يُرجى التواصل معنا على ${E.email}؛ فمعظم المسائل يمكن تسويتها سريعًا.`,
        ],
      },
      {
        heading: "14. تغييرات هذه الشروط",
        paragraphs: [
          "يجوز لنا تحديث هذه الشروط. في حالة التغييرات الجوهرية سنقدم إشعارًا لا يقل عن 14 يومًا بالبريد الإلكتروني أو داخل الخدمة قبل سريانها. يعني استمرارك في استخدام الخدمة بعد ذلك التاريخ قبولك للشروط المحدّثة؛ وإن لم توافق، فألغِ اشتراكك وتوقف عن استخدام الخدمة قبل ذلك.",
        ],
      },
      {
        heading: "15. التواصل",
        paragraphs: [
          `${E.name}، ${E.country} — ${E.email} — ${E.site}. تُرسل الاستفسارات المتعلقة بعملية دفع أو إيصال أو استرداد إلى العنوان نفسه؛ فـ Paymob تعالج الدفع فقط ولا يمكنها تغيير خطتك.`,
        ],
      },
    ],
  },
};
