import "server-only";

import { adminEmails } from "@/data/env/server";
import { escapeHtml } from "@/features/core/auth/emails/base-email";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";
import { isMailConfigured, sendMail } from "@/integrations/email";
import { redisClient } from "@/integrations/redis";

export type BillingAlertKind =
  | "event_failed"
  | "webhook_rejected"
  | "not_configured";

/** One alert per kind (and key) per window, so an attack cannot flood the inbox. */
const THROTTLE_SECONDS = 60 * 60;

/**
 * Emails the platform admins (`ADMIN_EMAILS`) that billing needs a human.
 * Never carries a callback payload — only what happened and the ids to
 * look it up on the admin pages. Best effort: an alert that cannot be
 * sent is logged, never thrown, so it can't break the payment path.
 *
 * `throttleKey` dedupes: pass the event id for per-event alerts, or leave
 * it out to get at most one alert of that kind per hour.
 */
export async function sendBillingAlert(input: {
  kind: BillingAlertKind;
  details: Record<string, string | null | undefined>;
  throttleKey?: string;
}): Promise<void> {
  try {
    if (!isMailConfigured() || adminEmails.size === 0) return;
    const key = `billing-alert:${input.kind}:${input.throttleKey ?? "any"}`;
    const claimed = await redisClient.set(key, "1", {
      nx: true,
      ex: THROTTLE_SECONDS,
    });
    if (claimed !== "OK") return;

    const { t } = createI18n(mainTranslations, "en", "en");
    const subject = t(`billing.alerts.subject.${input.kind}`);
    const lines = [
      t(`billing.alerts.body.${input.kind}`),
      "",
      ...Object.entries(input.details)
        .filter(([, value]) => value)
        .map(([label, value]) => `${label}: ${value}`),
      "",
      t("billing.alerts.where"),
    ];
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111111;">${lines
      .map((line) =>
        line ? `<p style="margin:4px 0;">${escapeHtml(line)}</p>` : "<br />",
      )
      .join("")}</div>`;

    for (const to of adminEmails) {
      await sendMail({
        toEmail: to,
        subject,
        text: lines.join("\n"),
        html,
        fromName: "Gateling billing",
      });
    }
  } catch (error) {
    console.error("[billing] alert could not be sent", error);
  }
}
