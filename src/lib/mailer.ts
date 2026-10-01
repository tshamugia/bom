import "server-only";
import { promises as dns } from "node:dns";
import nodemailer, { type Transporter } from "nodemailer";
import { env } from "./env";
import type { UserRole } from "./roles";

// Bypass nodemailer's built-in DNS: it calls dns.resolve4/6 directly and picks
// a random address from the union. On Railway, dns.resolve4 sometimes returns
// no records (EAI_AGAIN), leaving only IPv6 in the set — and Railway egress to
// Hostinger's Cloudflare-anycast IPv6 is ENETUNREACH with no fallback. We
// pre-resolve to an IPv4 address and pass `servername` so TLS/SNI still
// validates against the original hostname.
let cachedIp: { value: string; expires: number } | null = null;
const IP_TTL_MS = 5 * 60_000;

async function resolveSmtpHostIpv4(host: string): Promise<string> {
  const now = Date.now();
  if (cachedIp && cachedIp.expires > now) return cachedIp.value;
  const { address } = await dns.lookup(host, { family: 4 });
  cachedIp = { value: address, expires: now + IP_TTL_MS };
  return address;
}

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter | null> {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    const ipv4 = await resolveSmtpHostIpv4(env.SMTP_HOST);
    transporter = nodemailer.createTransport({
      host: ipv4,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      name: env.SMTP_HOST,
      tls: { servername: env.SMTP_HOST },
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
  const t = await getTransporter();
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
  role: UserRole;
}): Promise<SendMailResult> {
  const signInUrl = `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/sign-in`;
  const subject = "Your Revline account";
  const text = [
    `Hi ${args.name},`,
    ``,
    `An account has been created for you on Revline.`,
    ``,
    `Email: ${args.to}`,
    `Temporary password: ${args.password}`,
    `Role: ${args.role}`,
    ``,
    `Sign in: ${signInUrl}`,
    ``,
    `This password is temporary — you'll be asked to choose your own when you first sign in.`,
    ``,
    `On your phone, open the sign-in link and choose "Add to Home Screen" to install Revline as an app.`,
  ].join("\n");
  return sendMail({ to: args.to, subject, text });
}

/** An admin set a new temporary password for this user. */
export async function sendPasswordResetByAdminEmail(args: {
  to: string;
  name: string;
  password: string;
}): Promise<SendMailResult> {
  const signInUrl = `${env.NEXT_PUBLIC_BETTER_AUTH_URL}/sign-in`;
  const text = [
    `Hi ${args.name},`,
    ``,
    `An administrator has reset your Revline password. You have been signed out everywhere.`,
    ``,
    `Email: ${args.to}`,
    `Temporary password: ${args.password}`,
    ``,
    `Sign in: ${signInUrl}`,
    ``,
    `This password is temporary — you'll be asked to choose your own when you sign in.`,
  ].join("\n");
  return sendMail({ to: args.to, subject: "Your Revline password was reset", text });
}

/** Self-service reset link — only sent to admins (members are reset by an admin). */
export async function sendPasswordResetLinkEmail(args: {
  to: string;
  name: string;
  url: string;
  expiresInMinutes: number;
}): Promise<SendMailResult> {
  const text = [
    `Hi ${args.name},`,
    ``,
    `Someone asked to reset the password for your Revline account.`,
    `Open this link to choose a new one (valid for ${args.expiresInMinutes} minutes):`,
    ``,
    args.url,
    ``,
    `If you didn't ask for this, ignore this email — your password stays the same.`,
  ].join("\n");
  return sendMail({ to: args.to, subject: "Reset your Revline password", text });
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
