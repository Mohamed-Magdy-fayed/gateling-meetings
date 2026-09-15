import { dt } from "@/features/core/i18n/lib";

export const billingEn = {
  plans: {
    free: { name: "Free", tagline: "For trying it out." },
    pro: { name: "Pro", tagline: "For people who host regularly." },
    business: { name: "Business", tagline: "For teams and integrations." },
  },
  sources: {
    free: "Free",
    subscription: "Subscription",
    manual: "Granted",
    trial: "Trial",
  },
  features: {
    participants: "Up to {max:number} participants",
    minutes: "Meetings up to {max:number} minutes",
    hours: "Meetings up to {max:number} hours",
    unlimitedDuration: "Unlimited meeting length",
    upcoming: "Up to {max:number} upcoming scheduled meetings",
    unlimitedUpcoming: "Unlimited scheduled meetings",
    breakouts: "Breakout rooms",
    apiAccess: "API access, webhooks and SSO join links",
    seats: "Per-seat pricing for your team",
  },
  limits: {
    participants:
      "This meeting is full — its plan allows {max:number} participants.",
    minutes: "This plan allows meetings up to {max:number} minutes.",
    upcoming:
      "This plan allows {max:number} upcoming scheduled meetings. End or delete one, or upgrade.",
    breakouts: "Breakout rooms are not included in this plan.",
    apiAccess: "API access is not included in this plan.",
    seats: "All seats in this organization are taken.",
  },
  room: {
    endingSoon: "This meeting will end in 5 minutes (plan limit).",
    endsIn: "Meeting ends in {time}",
    cappedBy: "Free plan limit",
    upgrade: "Upgrade",
  },
  settings: {
    title: "Plan & billing",
    lead: "What {name} is on, and what that allows.",
    currentPlan: "Current plan",
    participants: "Participants per meeting",
    duration: "Meeting length",
    upcoming: "Upcoming scheduled meetings",
    seats: "Seats",
    api: "API access",
    unlimited: "Unlimited",
    minutes: dt("{count:plural}", {
      plural: { count: { one: "{?} minute", other: "{?} minutes" } },
    }),
    comparePlans: "Compare plans",
    subscriptionStatus: "Subscription: {status}",
    renews: "Renews {when:date}",
    upgradeTitle: "Upgrade",
    upgradeLead: "Pick a plan and how many seats. You can change both later.",
    choose: "Choose {plan}",
    seatsTitle: "Seats",
    seatsLead:
      "Each member of the organization takes a seat. Changes are prorated immediately.",
    updateSeats: "Update seats",
    seatsUpdated:
      "Seat change sent — it applies as soon as Paddle confirms it.",
    fewerSeats: "Fewer seats",
    moreSeats: "More seats",
    cancel: "Cancel subscription",
    cancelConfirm:
      "Cancel at the end of the current period? You keep your plan until then, and drop to Free after.",
    cancelled: "Cancellation scheduled for the end of the period.",
  },
  errors: {
    granted:
      "This organization's plan is managed by hand. Contact us to change it.",
    noSubscription: "There is no active subscription for this organization.",
    alreadySubscribed:
      "This organization already has a subscription — manage it below.",
    tooFewSeats:
      "You have {used:number} members; the seat count cannot go below that.",
    checkoutUnavailable: "Checkout is not available right now.",
  },
  tiers: {
    pro: {
      participants: "Up to 50 participants",
      duration: "Meetings up to 24 hours",
      scheduling: "Unlimited scheduled meetings",
      breakouts: "Breakout rooms",
      seats: "Per-seat pricing for your team",
    },
    business: {
      participants: "Up to 200 participants",
      duration: "Meetings up to 24 hours",
      scheduling: "Unlimited scheduled meetings",
      breakouts: "Breakout rooms",
      api: "API access, webhooks and SSO join links",
      seats: "Per-seat pricing for your team",
    },
  },
  pricing: {
    nav: "Pricing",
    title: "Simple pricing",
    lead: "Start free. Upgrade when you need longer meetings, more people, or the API.",
    interval: { month: "Monthly", year: "Yearly" },
    perSeat: { month: "per seat / month", year: "per seat / year" },
    current: "Current plan",
    subscribe: "Subscribe",
    upgrade: "Upgrade",
    manage: "Manage billing",
    unavailable: "Prices are not available right now.",
    freeNote:
      "The Free plan (5 participants, 40-minute meetings) needs no card — just sign up.",
    contact: "Talk to us",
    contactLead:
      "Need custom limits or an invoice? We can set your organization up by hand.",
  },
  welcome: {
    title: "Welcome aboard!",
    leadActive: "{org} is upgraded and ready to go. Thanks for subscribing.",
    leadPending:
      "Thanks for subscribing — {org} is being upgraded right now. It usually takes a few seconds.",
    pendingNote:
      "You can leave this page; the plan switches by itself once Paddle confirms the payment. If it has not after a few minutes, check the billing page or contact us.",
    goToDashboard: "Go to dashboard",
  },
} as const;
