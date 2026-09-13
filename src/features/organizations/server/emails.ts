import "server-only";

import { baseUrl } from "@/data/env/server";
import { renderBaseEmail } from "@/features/core/auth/emails/base-email";
import { mainTranslations } from "@/features/core/i18n/global";
import { createI18n } from "@/features/core/i18n/lib";
import { sendMail } from "@/integrations/email";
import { inviteUrl } from "./invites";

export async function sendOrganizationInviteEmail(options: {
  to: string;
  organizationName: string;
  inviterName: string;
  token: string;
  locale: string;
}) {
  const { to, organizationName, inviterName, token, locale } = options;
  const { t } = createI18n(mainTranslations, locale, "en");
  const url = inviteUrl(baseUrl, token);
  await sendMail({
    toEmail: to,
    subject: t("organizations.emails.invite.subject", {
      organization: organizationName,
    }),
    text: t("organizations.emails.invite.text", {
      inviter: inviterName,
      organization: organizationName,
      url,
    }),
    html: renderBaseEmail({
      dir: locale === "ar" ? "rtl" : "ltr",
      greeting: t("auth.emails.common.greeting", {
        name: t("auth.emails.common.defaultRecipientName"),
      }),
      intro: t("organizations.emails.invite.intro", {
        inviter: inviterName,
        organization: organizationName,
      }),
      ctaLabel: t("organizations.emails.invite.cta"),
      ctaUrl: url,
      notice: t("organizations.emails.invite.notice"),
      signature: t("auth.emails.common.signature"),
    }),
    fromName: t("appName"),
  });
}
