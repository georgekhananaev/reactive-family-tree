/*
 * Sending email. The family chooses how: SMTP, Resend, or nothing at all.
 * With nothing configured a message is written to the server log, which is
 * enough to run a tree at home: sign-in links can be read there and
 * invitations are handed over as links.
 */

import { createTransport } from 'nodemailer';

import type { AppConfig } from './config';

export interface Message {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  /* Whether messages really leave the building. The app offers links instead when they do not. */
  readonly delivers: boolean;
  send(message: Message): Promise<void>;
}

/* How long a mail service is waited for. Past that, whoever asked is told the letter did not go, and is not left waiting with it. */
const SEND_WAIT_MS = 20_000;

export function createMailer({ from, smtpUrl, resendKey }: AppConfig['email']): Mailer {
  if (resendKey) {
    return {
      delivers: true,
      async send({ to, subject, text }) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, subject, text }),
          signal: AbortSignal.timeout(SEND_WAIT_MS),
        });
        // Resend says why in the body: an unverified domain, a wrong sender, a spent quota
        if (!response.ok) throw new Error(`Resend refused the message (${response.status}): ${(await response.text()).slice(0, 300)}`);
      },
    };
  }
  if (smtpUrl) {
    const transport = createTransport(smtpUrl);
    return {
      delivers: true,
      async send({ to, subject, text }) {
        await transport.sendMail({ from, to, subject, text });
      },
    };
  }
  return {
    delivers: false,
    async send({ to, subject, text }) {
      console.log(`\n[email not configured] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    },
  };
}
