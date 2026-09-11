import "server-only";

import nodemailer from "nodemailer";

import { env } from "@/data/env/server";

export type SendMailOptions = {
  toEmail: string;
  toName?: string | null;
  subject: string;
  text?: string;
  html: string;
  fromName?: string;
  /** Attaches a calendar invite the recipient's client can add in one click. */
  icalEvent?: {
    content: string;
    method?: "REQUEST" | "CANCEL";
    filename?: string;
  };
};

let cachedTransporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASSWORD) return null;
  if (cachedTransporter) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_PORT === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASSWORD,
    },
  });

  return cachedTransporter;
}

/**
 * SMTP credentials aren't provided until Mohamed sets them up (see STATE.md
 * "Environment / credentials needed later") — logs a warning and no-ops in
 * that case, since that's an expected pre-launch state, not a failure.
 *
 * Once SMTP *is* configured, a failed send throws instead of being swallowed
 * — callers (e.g. Inngest functions) need to know delivery didn't happen so
 * they can retry/report it, rather than reporting success for an email that
 * was never sent.
 */
export async function sendMail(options: SendMailOptions): Promise<void> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      "[email] SMTP not configured, skipping send:",
      options.subject,
    );
    return;
  }

  const fromEmail = env.SMTP_FROM_EMAIL ?? env.SMTP_USER;
  const fromName = env.SMTP_FROM_NAME ?? "Gateling Meetings";
  const to = options.toName
    ? `${options.toName} <${options.toEmail}>`
    : options.toEmail;

  await transporter.sendMail({
    from: `${fromName} <${fromEmail}>`,
    to,
    subject: options.subject,
    text: options.text,
    html: options.html,
    icalEvent: options.icalEvent
      ? {
          filename: options.icalEvent.filename ?? "invite.ics",
          method: options.icalEvent.method ?? "REQUEST",
          content: options.icalEvent.content,
        }
      : undefined,
  });
}
