export type BaseEmailOptions = {
  dir?: "ltr" | "rtl";
  greeting: string;
  intro: string;
  ctaLabel?: string;
  ctaUrl?: string;
  codeBlock?: string;
  notice: string;
  signature: string;
};

// Every value here can carry a user-supplied display name or query-string
// characters (from `name` / `verificationUrl`) — escape before interpolating
// into HTML to avoid stored XSS in the recipient's mail client.
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderBaseEmail(options: BaseEmailOptions): string {
  const dir = options.dir ?? "ltr";

  const ctaSection =
    options.ctaUrl && options.ctaLabel
      ? `<tr><td align="center" style="padding:24px 0;">
           <a href="${escapeHtml(options.ctaUrl)}" style="background-color:#111111;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">${escapeHtml(options.ctaLabel)}</a>
         </td></tr>`
      : "";

  const codeSection = options.codeBlock
    ? `<tr><td align="center" style="padding:24px 0;">
         <span style="display:inline-block;background-color:#111111;color:#ffffff;padding:12px 24px;border-radius:6px;font-size:20px;letter-spacing:6px;font-weight:600;">${escapeHtml(options.codeBlock)}</span>
       </td></tr>`
    : "";

  return `<!doctype html>
<html dir="${dir}">
  <body style="background-color:#ffffff;margin:0;padding:0;">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;padding:24px;">
      <tr><td style="font-size:16px;padding:0 0 16px;">${escapeHtml(options.greeting)}</td></tr>
      <tr><td style="font-size:16px;padding:0 0 16px;">${escapeHtml(options.intro)}</td></tr>
      ${ctaSection}
      ${codeSection}
      <tr><td style="font-size:14px;color:#444444;padding:0 0 16px;">${escapeHtml(options.notice)}</td></tr>
      <tr><td style="border-top:1px solid #eeeeee;padding-top:24px;font-size:14px;color:#444444;white-space:pre-line;">${escapeHtml(options.signature)}</td></tr>
    </table>
  </body>
</html>`;
}
