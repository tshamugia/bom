import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth:
        env.SMTP_USER && env.SMTP_PASSWORD
          ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD }
          : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export type MailAttachment = {
  filename: string;
  content: Buffer;
  contentType?: string;
};

export type SendMailResult =
  | { sent: true }
  | { sent: false; reason: "SMTP_NOT_CONFIGURED" }
  | { sent: false; reason: "SMTP_SEND_FAILED"; detail: string };

export async function sendMail(opts: {
  to: string | string[];
  cc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
}): Promise<SendMailResult> {
  const t = getTransporter();
  if (!t) return { sent: false, reason: "SMTP_NOT_CONFIGURED" };
  try {
    await t.sendMail({ from: env.EMAIL_FROM, ...opts });
    return { sent: true };
  } catch (e) {
    const detail = e instanceof Error ? (e.message || e.name) : String(e);
    console.error("[mailer] sendMail failed", {
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      from: env.EMAIL_FROM,
      to: opts.to,
      error: e,
    });
    return { sent: false, reason: "SMTP_SEND_FAILED", detail };
  }
}

export async function sendWelcomeEmail(args: {
  to: string;
  name: string;
  password: string;
  role: "owner" | "admin" | "member";
}): Promise<SendMailResult> {
  const signInUrl = `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/sign-in`;
  const subject = "Your BOM Studio account";
  const text = [
    `Hi ${args.name},`,
    ``,
    `An account has been created for you on BOM Studio.`,
    ``,
    `Email: ${args.to}`,
    `Temporary password: ${args.password}`,
    `Role: ${args.role}`,
    ``,
    `Sign in: ${signInUrl}`,
    ``,
    `Please change your password after your first sign-in.`,
  ].join("\n");
  return sendMail({ to: args.to, subject, text });
}

export async function sendProcurementBomEmail(args: {
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  attachment: MailAttachment;
}): Promise<SendMailResult> {
  return sendMail({
    to: args.to,
    cc: args.cc && args.cc.length > 0 ? args.cc : undefined,
    subject: args.subject,
    text: args.text,
    attachments: [args.attachment],
  });
}
