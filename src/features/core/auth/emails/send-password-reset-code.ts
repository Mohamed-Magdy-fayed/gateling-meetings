import "server-only";

import type { SendPasswordResetCodeEmail } from "@/features/core/auth/types";
import { getLocaleCookie, getT } from "@/features/core/i18n/server";
import { sendMail } from "@/integrations/email";
import { renderBaseEmail } from "./base-email";

export const sendPasswordResetCodeEmail: SendPasswordResetCodeEmail = async (
  options,
) => {
  const [{ t }, locale] = await Promise.all([getT(), getLocaleCookie()]);
  const displayName =
    options.name?.trim() || t("auth.emails.common.defaultRecipientName");
  const expiresInMinutes = Math.max(options.expiresInMinutes, 1);
  const expiresIn = String(expiresInMinutes);
  const minutesLabel =
    expiresInMinutes === 1
      ? t("auth.emails.common.minuteSingular")
      : t("auth.emails.common.minutePlural");

  const subject = t("auth.emails.passwordReset.subject");
  const text = t("auth.emails.passwordReset.text", {
    name: displayName,
    expiresIn,
    minutesLabel,
    code: options.code,
  });

  const html = renderBaseEmail({
    dir: locale === "ar" ? "rtl" : "ltr",
    greeting: t("auth.emails.common.greeting", { name: displayName }),
    intro: t("auth.emails.passwordReset.intro", { expiresIn, minutesLabel }),
    codeBlock: options.code,
    notice: t("auth.emails.passwordReset.ignore"),
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
