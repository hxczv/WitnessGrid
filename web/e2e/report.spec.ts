import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { signIn } from "./helpers";

test("a signed-in witness can file a record and it enters the register", async ({ page }) => {
  const email = `e2e-report-${Date.now()}@example.com`;
  const username = `reporter_${Date.now().toString(36)}`;
  await signIn(page, email, username);

  await page.goto("/report");
  await expect(page.getByRole("heading", { name: /report an encounter/i })).toBeVisible();

  // Step 1 — capture: upload a unique image (equivalent path to camera photo).
  // The media table de-dups on content hash, so every run needs fresh bytes.
  const img = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < img.data.length; i++) img.data[i] = Math.floor(Math.random() * 256);
  await page.locator('input[type="file"]').setInputFiles({
    name: `capture_${Date.now()}.png`,
    mimeType: "image/png",
    buffer: PNG.sync.write(img),
  });
  await expect(page.getByLabel(/attachment 1/i)).toBeVisible();

  // Step 2 — pin: click the map to place the pin.
  await page.getByRole("button", { name: /continue/i }).click();
  await page.locator('[data-testid="pin-map"] canvas').click({ position: { x: 220, y: 160 } });
  await expect(page.getByText(/^PIN /)).toBeVisible();

  // Step 3 — details: choose the broadest default type, accept the age gate, submit.
  await page.getByRole("button", { name: /continue/i }).click();
  const incidentType = await page.locator("select").first().inputValue();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /submit to the register/i }).click();

  await expect(page.getByText(/report in the register/i)).toBeVisible({ timeout: 30_000 });

  // The record now appears in the public feed.
  const label = incidentType.replaceAll("_", " ");
  await page.goto("/");
  await expect(page.getByText(label, { exact: false }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(username)).toBeVisible();
});