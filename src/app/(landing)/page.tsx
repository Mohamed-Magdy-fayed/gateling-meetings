import {
  ArrowUpRightIcon,
  CalendarClockIcon,
  LayoutGridIcon,
  LinkIcon,
} from "lucide-react";

import { GatelingMark } from "@/components/brand/gateling-mark";
import { LinkButton } from "@/components/general/link-button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { LEGAL_ENTITY } from "@/features/legal/content/types";
import { JoinByCodeForm } from "@/features/meetings/components/join-by-code-form";
import { NewMeetingButton } from "@/features/meetings/components/new-meeting-button";

const FEATURES = [
  { key: "instant", Icon: CalendarClockIcon },
  { key: "guests", Icon: LinkIcon },
  { key: "rooms", Icon: LayoutGridIcon },
] as const;

const STEPS = ["start", "share", "meet"] as const;

export default async function HomePage() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);

  return (
    <main className="relative flex flex-1 flex-col overflow-x-clip">
      {/* Atmosphere: a warm brand glow bleeding in from the top-start corner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -start-40 size-[32rem] rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[40rem] -end-32 size-[28rem] rounded-full bg-orange-500/10 blur-3xl"
      />

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-5xl gap-10 px-4 pt-16 pb-14 md:grid-cols-[1.2fr_1fr] md:items-center md:pt-24 md:pb-20">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/5 py-1 pe-3 ps-1.5 text-xs font-medium text-accent-foreground">
            <GatelingMark size={16} />
            {t("meetings.home.eyebrow")}
          </p>
          <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-balance sm:text-5xl md:text-6xl">
            {t("meetings.home.tagline")}
          </h1>
          <p className="max-w-prose text-base text-muted-foreground text-pretty md:text-lg">
            {t("meetings.home.lead")}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {user ? (
              <NewMeetingButton className="h-11 px-5 text-sm" />
            ) : (
              <LinkButton
                href="/auth/sign-in"
                size="lg"
                className="h-11 px-5 text-sm"
              >
                {t("meetings.home.signInToHost")}
              </LinkButton>
            )}
            <LinkButton
              href="/pricing"
              variant="ghost"
              size="lg"
              className="h-11 px-4 text-sm"
            >
              {t("billing.pricing.nav")}
            </LinkButton>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {t("meetings.home.join")}
          </p>
          <JoinByCodeForm />
        </div>
      </section>

      {/* How it works */}
      <section
        aria-labelledby="home-steps"
        className="mx-auto w-full max-w-5xl px-4 pb-14 md:pb-20"
      >
        <h2
          id="home-steps"
          className="mb-6 font-display text-2xl tracking-tight"
        >
          {t("meetings.home.howItWorks.heading")}
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <li
              key={step}
              className="relative rounded-xl border border-border bg-card p-5 ps-16"
            >
              <span
                aria-hidden
                className="absolute start-5 top-5 grid size-8 place-items-center rounded-full bg-primary font-display text-sm font-bold text-primary-foreground"
              >
                {index + 1}
              </span>
              <h3 className="font-display text-base">
                {t(`meetings.home.howItWorks.${step}.title`)}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground text-pretty">
                {t(`meetings.home.howItWorks.${step}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section
        aria-labelledby="home-features"
        className="mx-auto w-full max-w-5xl px-4 pb-14 md:pb-20"
      >
        <h2
          id="home-features"
          className="mb-6 font-display text-2xl tracking-tight"
        >
          {t("meetings.home.features.heading")}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ key, Icon }) => (
            <Card key={key}>
              <CardHeader>
                <span className="mb-1 grid size-9 place-items-center rounded-md bg-accent text-accent-foreground">
                  <Icon aria-hidden className="size-4.5" />
                </span>
                <CardTitle className="font-display text-lg">
                  {t(`meetings.home.features.${key}.title`)}
                </CardTitle>
                <CardDescription className="text-sm text-pretty">
                  {t(`meetings.home.features.${key}.body`)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Who built this */}
      <section
        aria-labelledby="home-built-by"
        className="mx-auto w-full max-w-5xl px-4 pb-20 md:pb-28"
      >
        <div className="relative overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-900 p-8 text-neutral-100 md:p-12 dark:border-border dark:bg-card">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -end-24 size-80 rounded-full bg-orange-500/25 blur-3xl"
          />
          <div className="relative grid gap-8 md:grid-cols-[auto_1fr] md:items-center">
            <GatelingMark size={96} className="hidden md:block" />
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-300">
                {t("meetings.home.builtBy.eyebrow")}
              </p>
              <h2
                id="home-built-by"
                className="font-display text-3xl tracking-tight text-balance text-white"
              >
                {t("meetings.home.builtBy.heading")}
              </h2>
              <p className="max-w-2xl text-base text-neutral-300 text-pretty">
                {t("meetings.home.builtBy.body")}
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a
                  href={LEGAL_ENTITY.site}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-10 items-center gap-1.5 rounded-md bg-orange-500 px-4 text-sm font-semibold text-neutral-900 transition-colors duration-150 hover:bg-orange-400"
                >
                  {t("meetings.home.builtBy.site")}
                  <ArrowUpRightIcon
                    aria-hidden
                    className="size-4 rtl:-scale-x-100"
                  />
                </a>
                <a
                  href={`${LEGAL_ENTITY.site}/contact`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-10 items-center rounded-md border border-neutral-600 px-4 text-sm font-semibold text-neutral-100 transition-colors hover:border-neutral-400 hover:bg-white/5"
                >
                  {t("meetings.home.builtBy.contact")}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
