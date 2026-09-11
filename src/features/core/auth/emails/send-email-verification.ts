import "server-only";

import type { SendEmailVerificationEmail } from "@/features/core/auth/types";
import { getLocaleCookie, getT } from "@/features/core/i18n/server";
import { sendMail } from "@/integrations/email";
import { renderBaseEmail } from "./base-email";

export const sendEmailVerificationEmail: SendEmailVerificationEmail = async (
  options,
) => {
  const [{ t }, locale] = await Promise.all([getT(), getLocaleCookie()]);
  const expiryHours = "24";
  const displayName =
    options.name?.trim() || t("auth.emails.common.defaultRecipientName");

  const subject = t("auth.emails.emailVerification.subject");
  const text = t("auth.emails.emailVerification.text", {
    name: displayName,
    expiryHours,
    verificationUrl: options.verificationUrl,
  });

  const html = renderBaseEmail({
    dir: locale === "ar" ? "rtl" : "ltr",
    greeting: t("auth.emails.common.greeting", { name: displayName }),
    intro: t("auth.emails.emailVerification.intro", { expiryHours }),
    ctaLabel: t("auth.emails.emailVerification.ctaLabel"),
    ctaUrl: options.verificationUrl,
    notice: t("auth.emails.emailVerification.ignore"),
    signature: t("auth.emails.common.signature"),
  });

  await sendMail({
    toEmail: options.to,
    toName: displayName,
    subject,
    text,
    html,
    fromName: t("auth.emails.common.fromName"),
  });
};
