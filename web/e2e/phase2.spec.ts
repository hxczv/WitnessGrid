import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { signIn } from "./helpers";

const SEED_INCIDENT = "/incident/00000000-0000-4000-8000-000000001005";

test("search filters the register and the URL reflects the query", async ({ page }) => {
  await page.goto("/");
  const search = page.getByTestId("feed-search");
  await expect(search).toBeVisible();

  // A distinctive seed term finds its record.
  await search.fill("Cardigan");
  await page.getByRole("button", { name: /filter/i }).click();
  await expect(page).toHaveURL(/q=Cardigan/);
  await expect(page.getByText(/Cardigan/i).first()).toBeVisible({ timeout: 15_000 });

  // An absurd query yields the empty state.
  await search.fill("zzzqqqnosuchterm");
  await page.getByRole("button", { name: /filter/i }).click();
  await expect(page.getByText(/end of register/i)).toBeVisible({ timeout: 15_000 });
});

test("a signed-in user can rate and replace a rating", async ({ page }) => {
  const email = `e2e-rate-${Date.now()}@example.com`;
  const username = `rater_${Date.now().toString(36)}`;
  await signIn(page, email, username);

  await page.goto(SEED_INCIDENT);
  await expect(page.getByRole("heading", { name: /arrest|supermarket/i }).first()).toBeVisible();

  const avgLocator = page.getByTestId("rating-avg-appropriateness");
  await page.getByRole("radio", { name: /appropriateness: 5 of 5/i }).click();
  await expect(avgLocator).toContainText("/ 5", { timeout: 15_000 });
  const afterFive = parseFloat((await avgLocator.innerText()).split("/")[0]!);

  await page.getByRole("radio", { name: /appropriateness: 1 of 5/i }).click();
  await expect(avgLocator).toContainText("/ 5", { timeout: 15_000 });
  const afterOne = parseFloat((await avgLocator.innerText()).split("/")[0]!);
  expect(afterOne).toBeLessThan(afterFive);
});

test("account deletion anonymizes but keeps the submitted record", async ({ page }) => {
  const email = `e2e-del-${Date.now()}@example.com`;
  const username = `deleter_${Date.now().toString(36)}`;
  await signIn(page, email, username);

  // File a record via the wizard so we own a fresh incident.
  await page.goto("/report");
  await expect(page.getByRole("heading", { name: /report an encounter/i })).toBeVisible();
  const img = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < img.data.length; i++) img.data[i] = Math.floor(Math.random() * 256);
  await page.locator('input[type="file"]').setInputFiles({
    name: `capture_${Date.now()}.png`,
    mimeType: "image/png",
    buffer: PNG.sync.write(img),
  });
  await expect(page.getByLabel(/attachment 1/i)).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.locator('[data-testid="pin-map"] canvas').click({ position: { x: 220, y: 160 } });
  await expect(page.getByText(/^PIN /)).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /submit to the register/i }).click();
  await expect(page.getByText(/report in the register/i)).toBeVisible({ timeout: 30_000 });

  // Grab our incident id from the profile register list.
  await page.goto("/profile");
  const row = page.locator('a[href^="/incident/"]').first();
  const href = await row.getAttribute("href");
  expect(href).toMatch(/^\/incident\/[0-9a-f-]{36}$/);

  // Delete the account.
  await page.getByRole("button", { name: /delete account/i }).click();
  await page.getByLabel(/type delete my account to confirm/i).fill("delete my account");
  await page.getByRole("button", { name: /delete my account forever/i }).click();
  await expect(page).toHaveURL("/", { timeout: 15_000 });

  // The record survives, anonymized.
  await page.goto(href!);
  await expect(page.getByText(/anonymous witness/i)).toBeVisible();
});
