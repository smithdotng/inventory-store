import 'server-only';
import nodemailer from 'nodemailer';
import { env } from './env';

// Same SMTP settings as config/mailer.js (Hostinger).
const g = globalThis as unknown as { __shedMailer?: nodemailer.Transporter };
export const transporter: nodemailer.Transporter =
  g.__shedMailer ||
  (g.__shedMailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: env.emailUser, pass: env.emailPass },
    tls: { rejectUnauthorized: false },
  }));

/** Fire-and-forget send that never throws (mirrors `.catch(console.error)` usage). */
export function sendMailSafe(options: nodemailer.SendMailOptions) {
  return transporter.sendMail({ from: env.emailUser, ...options }).catch((err) => {
    console.error('Email send failed:', err?.message);
    return null;
  });
}
