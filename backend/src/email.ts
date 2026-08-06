import { appendFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from './config.js';

export const DEV_MAIL_LOG = join(process.cwd(), '.dev-mail.log');

interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// With RESEND_API_KEY set the mail goes through Resend; without it the mail is
// appended to .dev-mail.log so local development works without an SMTP account.
async function sendMail(mail: Mail): Promise<void> {
  const apiKey = config.RESEND_API_KEY;
  if (apiKey) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Resend responded ${response.status}: ${body}`);
    }
    return;
  }

  console.log(`[dev-mail] to=${mail.to}\n${mail.subject}\n${mail.text}`);
  try {
    await appendFile(DEV_MAIL_LOG, `${new Date().toISOString()} to=${mail.to}\n${mail.subject}\n${mail.text}\n\n`);
  } catch {
    // The log file is a convenience for local sign-in; never block on it.
  }
}

export async function sendMagicLink(to: string, link: string): Promise<void> {
  await sendMail({
    to,
    subject: 'WitnessGrid sign-in link',
    text: `Use this link to sign in to WitnessGrid (valid for ${config.MAGIC_LINK_TTL_MINUTES} minutes):\n\n${link}`,
    html: `<p>Use this link to sign in to WitnessGrid (valid for ${config.MAGIC_LINK_TTL_MINUTES} minutes):</p><p><a href="${link}">${link}</a></p>`,
  });
}

export async function sendAreaAlert(to: string, areaName: string, incidentUrl: string): Promise<void> {
  const apiKey = config.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[dev-mail] saved-area alert to=${to} area="${areaName}" ${incidentUrl}`);
    try {
      await appendFile(DEV_MAIL_LOG, `[dev-mail] saved-area alert to=${to} area="${areaName}" ${incidentUrl}\n`);
    } catch {
      // The log file is a convenience for local development; never block on it.
    }
    return;
  }
  await sendMail({
    to,
    subject: `New incident recorded in your saved area "${areaName}"`,
    text: `A new incident was recorded inside your saved area "${areaName}".\n\nView the record: ${incidentUrl}`,
  });
}
