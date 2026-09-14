import { CalendarClockIcon, LayoutGridIcon, LinkIcon } from "lucide-react";

import { LinkButton } from "@/components/general/link-button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/features/core/auth/nextjs/currentUser";
import { getT } from "@/features/core/i18n/server";
import { JoinByCodeForm } from "@/features/meetings/components/join-by-code-form";
import { NewMeetingButton } from "@/features/meetings/components/new-meeting-button";

const FEATURES = [
  { key: "instant", Icon: CalendarClockIcon },
  { key: "guests", Icon: LinkIcon },
  { key: "rooms", Icon: LayoutGridIcon },
] as const;

export default async function HomePage() {
  const [{ t }, user] = await Promise.all([getT(), getCurrentUser()]);

  return (
    <main className="relative flex flex-1 flex-col justify-center overflow-hidden">
      {/* Atmosphere: a warm brand glow bleeding in from the top-start corner. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -start-40 size-[32rem] rounded-full bg-primary/15 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -end-32 size-[28rem] rounded-full bg-sky-500/10 blur-3xl"
      />

      <section className="mx-auto grid w-full max-w-5xl gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:items-center md:py-24">
        <div className="space-y-6">
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
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card/80 p-5 shadow-[var(--shadow-lg)] backdrop-blur">
          <p className="mb-3 text-sm font-medium text-muted-foreground">
            {t("meetings.home.join")}
          </p>
          <JoinByCodeForm />
        </div>
      </section>

      <section
        aria-labelledby="home-features"
        className="mx-auto w-full max-w-5xl px-4 pb-16 md:pb-24"
      >
        <h2
          id="home-features"
          className="mb-5 font-display text-2xl tracking-tight"
        >
          {t("meetings.home.features.heading")}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ key, Icon }) => (
            <Card key={key} className="bg-card/80 backdrop-blur">
              <CardHeader>
                <Icon aria-hidden className="mb-1 size-5 text-primary" />
                <CardTitle className="font-display text-lg">
                  {t(`meetings.home.features.${key}.title`)}
                </CardTitle>
                <CardDescription className="text-pretty">
                  {t(`meetings.home.features.${key}.body`)}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
