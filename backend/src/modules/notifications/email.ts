import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { config } from '../../config/index.js'
import { logger } from '../../lib/logger.js'

export interface EmailMessage {
  to: string
  subject: string
  text: string
  html?: string
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>
}

class SmtpSender implements EmailSender {
  private readonly transporter: Transporter

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.smtp!.host,
      port: config.smtp!.port,
      secure: config.smtp!.secure,
      auth: {
        user: config.smtp!.user,
        pass: config.smtp!.pass,
      },
    })
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: config.smtp!.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      })
    } catch (err) {
      // Notification failures are logged, never thrown (spec: after-commit
      // send failure must not roll a transaction back).
      logger.error('[mail] send failed', err)
    }
  }
}

/** Last N messages captured by the dev (log-only) sender, for tests. */
export const sentEmails: EmailMessage[] = []

class LogOnlySender implements EmailSender {
  async send(message: EmailMessage): Promise<void> {
    sentEmails.push(message)
    logger.info(`[mail:dev] to=${message.to} subject="${message.subject}" body="${message.text}"`)
  }
}

export const emailSender: EmailSender = config.smtp ? new SmtpSender() : new LogOnlySender()

export function sendEmail(to: string, subject: string, text: string, html?: string): Promise<void> {
  return emailSender.send({ to, subject, text, html })
}

export function sendOtpEmail(to: string, code: string): Promise<void> {
  return sendEmail(
    to,
    'Sahayak verification code',
    `Your Sahayak verification code is ${code}. It expires in 10 minutes.`,
    `<p>Your Sahayak verification code is</p><p style="font-size:24px;font-weight:bold">${code}</p><p>It expires in 10 minutes.</p>`,
  )
}