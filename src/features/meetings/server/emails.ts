import "server-only";

import { baseUrl } from "@/data/env/server";
import type { Meeting, MeetingInvite } from "@/drizzle/schema";
import { renderBaseEmail } from "@/features/core/auth/emails/base-email";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";
import { buildIcs, googleCalendarUrl } from "@/features/meetings/lib/calendar";
import { sendMail } from "@/integrations/email";

const DEFAULT_DURATION_MINUTES = 60;

type Host = { name: string | null; email: string };

export function inviteUrl(meeting: Pick<Meeting, "code">, token: string) {
  return `${baseUrl}/m/${meeting.code}?invite=${encodeURIComponent(token)}`;
}

function eventFor(meeting: Meeting, host: Host, url: string) {
  const start = meeting.scheduledAt ?? new Date();
  const end = new Date(
    start.getTime() +
      (meeting.durationMinutes ?? DEFAULT_DURATION_MINUTES) * 60_000,
  );
  return {
    uid: `${meeting.code}@${new URL(baseUrl).host}`,
    title: meeting.title,
    description: url,
    url,
    start,
    end,
    organizer: { name: host.name ?? host.email, email: host.email },
  };
}

function formatWhen(meeting: Meeting, locale: string) {
  if (!meeting.scheduledAt) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: meeting.timezone ?? undefined,
  }).format(meeting.scheduledAt);
}

/**
 * One invitation email with the .ics attached and an "Add to Google
 * Calendar" link in the body. Throws on a real delivery failure so the
 * Inngest step retries; a no-SMTP environment logs and returns.
 */
export async function sendInviteEmail(options: {
  meeting: Meeting;
  host: Host;
  invite: Pick<MeetingInvite, "email" | "name" | "token">;
  locale: string;
}) {
  const { meeting, host, invite, locale } = options;
  const { t } = createI18n(mainTranslations, locale, "en");
  const url = inviteUrl(meeting, invite.token);
  const event = eventFor(meeting, host, url);
  const hostName = host.name ?? host.email;
  const when = formatWhen(meeting, locale);
  const displayName =
    invite.name ?? t("auth.emails.common.defaultRecipientName");

  await sendMail({
    toEmail: invite.email,
    toName: invite.name,
    subject: t("meetings.emails.invite.subject", {
      title: meeting.title,
      host: hostName,
    }),
    text: t("meetings.emails.invite.text", {
      title: meeting.title,
      host: hostName,
      when,
      url,
    }),
    html: renderBaseEmail({
      dir: locale === "ar" ? "rtl" : "ltr",
      greeting: t("auth.emails.common.greeting", { name: displayName }),
      intro: t("meetings.emails.invite.intro", {
        host: hostName,
        title: meeting.title,
        when,
      }),
      ctaLabel: t("meetings.emails.invite.cta"),
      ctaUrl: url,
      notice: t("meetings.emails.invite.calendar", {
        googleUrl: googleCalendarUrl(event),
      }),
      signature: t("auth.emails.common.signature"),
    }),
    fromName: t("appName"),
    icalEvent: { content: buildIcs(event), method: "REQUEST" },
  });
}

/** "Starts in 10 minutes" to the host and every invitee. */
export async function sendReminderEmail(options: {
  meeting: Meeting;
  host: Host;
  to: { email: string; name: string | null; url: string };
  locale: string;
}) {
  const { meeting, host, to, locale } = options;
  const { t } = createI18n(mainTranslations, locale, "en");
  const hostName = host.name ?? host.email;
  const when = formatWhen(meeting, locale);
  const displayName = to.name ?? t("auth.emails.common.defaultRecipientName");

  await sendMail({
    toEmail: to.email,
    toName: to.name,
    subject: t("meetings.emails.reminder.subject", { title: meeting.title }),
    text: t("meetings.emails.reminder.text", {
      title: meeting.title,
      host: hostName,
      when,
      url: to.url,
    }),
    html: renderBaseEmail({
      dir: locale === "ar" ? "rtl" : "ltr",
      greeting: t("auth.emails.common.greeting", { name: displayName }),
      intro: t("meetings.emails.reminder.intro", {
        title: meeting.title,
        host: hostName,
        when,
      }),
      ctaLabel: t("meetings.emails.invite.cta"),
      ctaUrl: to.url,
      notice: t("meetings.emails.reminder.notice"),
      signature: t("auth.emails.common.signature"),
    }),
    fromName: t("appName"),
  });
}
