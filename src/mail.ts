import nodemailer from "nodemailer";
import type { MailSender } from "./backend/email.js";

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

export function createSmtpMailer(config: SmtpConfig): MailSender {
  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: config.user ? { user: config.user, pass: config.pass ?? "" } : undefined,
  });

  return {
    async send(message) {
      const info = await transporter.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      return { messageId: info.messageId };
    },
  };
}
