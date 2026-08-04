import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("the public register is browsable without an account", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /the public register/i })).toBeVisible();
});

test("signing in via a magic link survives navigation", async ({ page }) => {
  const email = `e2e-auth-${Date.now()}@example.com`;
  await signIn(page, email, "e2e_witness");

  await page.goto("/profile");
  await expect(page.getByText("e2e_witness")).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
});

test("signing out clears the session", async ({ page }) => {
  const email = `e2e-out-${Date.now()}@example.com`;
  await signIn(page, email, "e2e_out");

  await page.goto("/profile");
  await page.getByRole("button", { name: /sign out/i }).click();
  await page.goto("/profile");
  await expect(page.getByRole("link", { name: /sign in to see your records/i })).toBeVisible();
});