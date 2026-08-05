import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export const DEV_MAIL_LOG = fileURLToPath(new URL("../../backend/.dev-mail.log", import.meta.url));

export function latestTokenFor(email: string): string {
  if (!fs.existsSync(DEV_MAIL_LOG)) {
    throw new Error(`dev-mail log missing: ${DEV_MAIL_LOG}`);
  }
  const lines = fs.readFileSync(DEV_MAIL_LOG, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    if (!line.includes(email)) continue;
    const m = line.match(/token=([0-9a-f]+)/);
    if (m?.[1]) return decodeURIComponent(m[1]);
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

  const token = latestTokenFor(email);
  await page.goto(`/signin?token=${encodeURIComponent(token)}`);
  // Default redirect lands on the feed once the session persists.
  await expect(page).toHaveURL(/\/$|\/profile/, { timeout: 15_000 });
}