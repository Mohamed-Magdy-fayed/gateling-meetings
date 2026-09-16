import {
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY,
  type LegalDocuments,
} from "./types";

const E = LEGAL_ENTITY;

export const refundsDocuments: LegalDocuments = {
  en: {
    title: "Refund and Cancellation Policy",
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro: [
      `This policy explains how cancellations and refunds work for paid ${E.product} plans. Payments are processed by Paymob on our behalf, and refunds are issued by us through Paymob to the original card.`,
    ],
    sections: [
      {
        heading: "1. Cancelling a subscription",
        paragraphs: [
          "You can cancel at any time from Settings → Billing. Cancelling stops all future charges immediately; your organization keeps its plan until the end of the period already paid for, and then returns to the Free plan. Nothing is deleted — your account, organizations and meetings stay as they are, subject to the Free plan's limits.",
        ],
      },
      {
        heading: "2. Refunds on a new subscription",
        paragraphs: [
          "If you are not satisfied within 14 days of your first payment for a plan, tell us and we will refund that payment in full — no questions asked. The subscription is cancelled at the same time.",
        ],
      },
      {
        heading: "3. Refunds on renewals",
        paragraphs: [
          "Renewal charges are refundable if you ask within 7 days of the charge and your organization has not hosted a meeting on the paid plan's limits in the new period. Outside that window, renewals are not refunded, but you can cancel so you are not charged again.",
        ],
      },
      {
        heading: "4. Seats",
        paragraphs: [
          "Adding seats is charged immediately for the remainder of the current period, prorated, and is not refundable separately from the subscription. Reducing seats takes effect at the next renewal; the lower price applies from then on and no refund is issued for the current period.",
        ],
      },
      {
        heading: "5. Failed payments and downgrades",
        paragraphs: [
          "If a renewal payment fails and is not settled within 7 days of the period end, the organization returns to the Free plan. No refund is due for a period that was never paid for.",
        ],
      },
      {
        heading: "6. Consumers in the EU, UK and elsewhere",
        paragraphs: [
          "If you are a consumer, you may have a statutory right to withdraw from a purchase within 14 days, and other mandatory rights, under the laws of your country. Nothing in this policy limits those rights; where they are more generous than this policy, they apply.",
        ],
      },
      {
        heading: "7. Chargebacks",
        paragraphs: [
          "Please ask us for a refund before disputing a charge with your bank — it is faster for you and avoids dispute fees. A chargeback filed while a refund request is open, or after a refund has been issued, may lead to the account being suspended until the matter is resolved.",
        ],
      },
      {
        heading: "8. How to request a refund",
        paragraphs: [
          `Email ${E.email} from the address on the account, with the organization name and the receipt or invoice number. Approved refunds are issued through Paymob within 5–10 business days to the original card; your bank may take up to 14 business days to show it.`,
        ],
      },
      {
        heading: "9. Changes",
        paragraphs: [
          "We may update this policy. Changes apply to purchases made after the new effective date and do not reduce rights you already have.",
        ],
      },
    ],
  },
  ar: {
    title: "سياسة الاسترداد والإلغاء",
    effectiveDate: LEGAL_EFFECTIVE_DATE,
    intro: [
      `توضح هذه السياسة كيفية عمل الإلغاء والاسترداد لخطط ${E.product} المدفوعة. تعالج Paymob المدفوعات نيابةً عنا، ونُصدر نحن المبالغ المستردة عبر Paymob إلى البطاقة الأصلية.`,
    ],
    sections: [
      {
        heading: "1. إلغاء الاشتراك",
        paragraphs: [
          "يمكنك الإلغاء في أي وقت من الإعدادات ← الفوترة. يوقف الإلغاء جميع الخصومات المستقبلية فورًا؛ تحتفظ مؤسستك بخطتها حتى نهاية الفترة المدفوعة بالفعل، ثم تعود إلى الخطة المجانية. لا يُحذف شيء — يبقى حسابك ومؤسساتك واجتماعاتك كما هي، مع خضوعها لحدود الخطة المجانية.",
        ],
      },
      {
        heading: "2. الاسترداد عند الاشتراك الجديد",
        paragraphs: [
          "إذا لم تكن راضيًا خلال 14 يومًا من أول دفعة لخطة ما، فأخبرنا وسنسترد لك تلك الدفعة كاملة — دون أسئلة. ويُلغى الاشتراك في الوقت نفسه.",
        ],
      },
      {
        heading: "3. الاسترداد عند التجديد",
        paragraphs: [
          "يمكن استرداد رسوم التجديد إذا طلبت ذلك خلال 7 أيام من الخصم ولم تستضف مؤسستك اجتماعًا بحدود الخطة المدفوعة في الفترة الجديدة. خارج هذه المهلة، لا تُسترد رسوم التجديد، لكن يمكنك الإلغاء حتى لا تُحاسَب مجددًا.",
        ],
      },
      {
        heading: "4. المقاعد",
        paragraphs: [
          "تُحتسب إضافة المقاعد فورًا لما تبقى من الفترة الحالية بشكل تناسبي، ولا تُسترد بشكل منفصل عن الاشتراك. يسري تقليل المقاعد عند التجديد التالي؛ ويُطبَّق السعر الأقل من ذلك الحين ولا يُصدر استرداد عن الفترة الحالية.",
        ],
      },
      {
        heading: "5. فشل الدفع وتخفيض الخطة",
        paragraphs: [
          "إذا فشل دفع التجديد ولم يُسدَّد خلال 7 أيام من نهاية الفترة، تعود المؤسسة إلى الخطة المجانية. لا يُستحق أي استرداد عن فترة لم تُدفع أصلًا.",
        ],
      },
      {
        heading: "6. المستهلكون في الاتحاد الأوروبي والمملكة المتحدة وغيرها",
        paragraphs: [
          "إذا كنت مستهلكًا، فقد يكون لك حق قانوني في التراجع عن الشراء خلال 14 يومًا، وحقوق إلزامية أخرى، بموجب قوانين بلدك. لا شيء في هذه السياسة يحدّ من تلك الحقوق؛ وحيثما تكون أوسع من هذه السياسة، فهي التي تُطبَّق.",
        ],
      },
      {
        heading: "7. الاعتراض على الخصم (Chargeback)",
        paragraphs: [
          "يُرجى طلب الاسترداد منا قبل الاعتراض على أي خصم لدى بنكك — فذلك أسرع لك ويجنّب رسوم النزاع. قد يؤدي تقديم اعتراض أثناء وجود طلب استرداد مفتوح، أو بعد إصدار الاسترداد، إلى تعليق الحساب حتى تسوية المسألة.",
        ],
      },
      {
        heading: "8. كيفية طلب الاسترداد",
        paragraphs: [
          `راسلنا على ${E.email} من البريد الإلكتروني المسجَّل في الحساب، مع ذكر اسم المؤسسة ورقم الإيصال أو الفاتورة. تُصدر المبالغ المستردة الموافَق عليها عبر Paymob خلال 5–10 أيام عمل إلى البطاقة الأصلية؛ وقد يستغرق بنكك حتى 14 يوم عمل لإظهارها.`,
        ],
      },
      {
        heading: "9. التغييرات",
        paragraphs: [
          "يجوز لنا تحديث هذه السياسة. تنطبق التغييرات على عمليات الشراء التي تتم بعد تاريخ السريان الجديد ولا تنتقص من حقوق تملكها بالفعل.",
        ],
      },
    ],
  },
};
