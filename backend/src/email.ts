import { config } from './config.js';
import { ApiError, errorCodes } from './errors.js';

export async function sendMagicLink(email: string, url: string): Promise<void> {
  if (config.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.RESEND_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: config.EMAIL_FROM,
        to: [email],
        subject: 'WitnessGrid sign-in link',
        text: `Sign in to WitnessGrid with this link (valid ${config.MAGIC_LINK_TTL_MINUTES} minutes): ${url}`,
        html: `<p>Sign in to WitnessGrid with this link (valid ${config.MAGIC_LINK_TTL_MINUTES} minutes):</p><p><a href="${url}">${url}</a></p>`,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new ApiError(errorCodes.STORAGE, `email provider error ${response.status}: ${body.slice(0, 300)}`);
    }
    return;
  }
  console.log(`[dev-mail] magic link for ${email}: ${url}`);
  try {
    const fs = await import('node:fs');
    const logUrl = new URL('../.dev-mail.log', import.meta.url);
    fs.appendFileSync(logUrl, `${JSON.stringify({ at: new Date().toISOString(), email, url })}\n`);
  } catch {
    /* dev-mail log is best-effort */
  }
}