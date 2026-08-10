import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const DEV_MAIL_LOG = fileURLToPath(new URL("../../backend/.dev-mail.log", import.meta.url));

export async function latestTokenFor(email: string, timeoutMs = 10_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  // The log writes one mail per block, prefixed by a UTC timestamp, e.g.:
  //   2026-… to=e2e-…@example.com
  //   WitnessGrid sign-in link
  //   Use this link to sign in to WitnessGrid (valid for 15 minutes):
  //
  //   http://localhost:3000/signin?token=…
  // The mail body itself contains a blank line, so blocks are split on the
  // timestamp prefix, never on blank lines.
  const blockPrefix = /(?=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z to=)/;
  while (Date.now() < deadline) {
    if (fs.existsSync(DEV_MAIL_LOG)) {
      const blocks = fs.readFileSync(DEV_MAIL_LOG, "utf8").split(blockPrefix);
      for (const block of [...blocks].reverse()) {
        if (!block.includes(email)) continue;
        const m = block.match(/token=([0-9a-f]+)/);
        if (m?.[1]) return decodeURIComponent(m[1]);
      }
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no magic link found for ${email} in ${DEV_MAIL_LOG}`);
}

/** Request a magic link, extract the token from the dev-mail log, and land signed-in. */
export async function signIn(page: Page, email: string, username: string): Promise<void> {
  await page.goto("/signin");
  await page.getByLabel(/email address/i).fill(email);
  await page.getByLabel(/username/i).fill(username);
  await page.getByRole("button", { name: /send me the link/i }).click();
  await expect(page.getByText(/check your inbox/i)).toBeVisible();

  const token = await latestTokenFor(email);
  await page.goto(`/signin?token=${encodeURIComponent(token)}`);
  // Default redirect lands on the feed once the session persists.
  await expect(page).toHaveURL(/\/$|\/profile/, { timeout: 15_000 });
}