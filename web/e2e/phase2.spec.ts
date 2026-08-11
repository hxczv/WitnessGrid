import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { signIn } from "./helpers";

const SEED_INCIDENT = "/incident/00000000-0000-4000-8000-000000001005";

// Regression: maplibre adds its own .maplibregl-map class to the container,
// which previously overrode the absolute positioning and collapsed the map
// to zero height. The container must stay full-size once the map initialises.
test("the map page renders a full-height map canvas", async ({ page }) => {
  await page.goto("/map");
  const container = page.getByTestId("map");
  const canvas = container.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(() => container.evaluate((el) => el.clientHeight), { timeout: 30_000 })
    .toBeGreaterThan(200);
  // The camera is locked to the UK/Ireland box: maplibre refuses to zoom
  // out past the zoom where the box fills the viewport, so hammering
  // zoom-out must not drop the zoom (>= 5.4 = UK still fills the screen).
  const zoomOut = page.locator(".maplibregl-ctrl-zoom-out");
  await expect(zoomOut).toBeVisible();
  for (let i = 0; i < 8; i++) {
    await zoomOut.click();
    await page.waitForTimeout(400);
  }
  const zoom = await page.evaluate(
    () => (globalThis as { __wgMap?: { getZoom(): number } }).__wgMap?.getZoom(),
  );
  expect(zoom ?? 0).toBeGreaterThan(5.4);
});

// Regression: the maxBounds box spans lat 49–61, which cuts straight through
// northern France, so foreign land (Dunkirk, Calais, Le Havre) sits inside
// the locked camera. A fill layer painted in the basemap water color must
// cover every pixel outside the British Isles.
test("the map masks out all foreign land", async ({ page }) => {
  await page.goto("/map");
  await expect(page.getByTestId("map").locator("canvas")).toBeVisible({ timeout: 30_000 });
  const result = await page.evaluate(async () => {
    type ProbeMap = {
      loaded(): boolean;
      once(event: string, cb: () => void): unknown;
      getStyle(): { layers: { id: string }[] };
      project(pos: [number, number]): { x: number; y: number };
      queryRenderedFeatures(
        point: { x: number; y: number },
        opts: { layers: string[] },
      ): unknown[];
    };
    const map = (globalThis as { __wgMap?: ProbeMap }).__wgMap;
    if (!map) return { ok: false as const };
    if (!map.loaded()) await new Promise<void>((r) => void map.once("load", r));
    await new Promise<void>((r) => void map.once("idle", r));
    const layerIds = map.getStyle().layers.map((l) => l.id);
    const maskAfterBasemap = layerIds.indexOf("uk-ie-mask") > layerIds.indexOf("basemap");
    const covered = (lon: number, lat: number) =>
      map.queryRenderedFeatures(map.project([lon, lat]), { layers: ["uk-ie-mask"] }).length > 0;
    return {
      ok: true as const,
      maskAfterBasemap,
      dunkirkCovered: covered(2.377, 51.05),
      calaisCovered: covered(1.855, 50.947),
      leHavreCovered: covered(0.11, 49.49),
      londonVisible: !covered(-0.1276, 51.5072),
      dublinVisible: !covered(-6.2603, 53.3498),
      manchesterVisible: !covered(-2.2426, 53.4808),
    };
  });
  expect(result.ok).toBe(true);
  expect(result.maskAfterBasemap).toBe(true);
  expect(result.dunkirkCovered).toBe(true);
  expect(result.calaisCovered).toBe(true);
  expect(result.leHavreCovered).toBe(true);
  expect(result.londonVisible).toBe(true);
  expect(result.dublinVisible).toBe(true);
  expect(result.manchesterVisible).toBe(true);
});

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
  const panel = page.locator('section[aria-label="Ratings"]');
  const panelText = await panel.innerText();
  const lines = panelText.split("\n").map((l) => l.trim());
  const countMatch = panelText.match(/Averaged from (\d+) rating/);
  const n0 = countMatch ? parseInt(countMatch[1]!, 10) : 0;
  const avg0Text = lines[lines.indexOf("APPROPRIATENESS") + 1] ?? "—";
  const avg0 = avg0Text === "—" ? null : parseFloat(avg0Text);
  const readAvg = async () => parseFloat((await avgLocator.innerText()).split("/")[0] ?? "0");

  // Replacing our own rating changes the mean deterministically: (sum + v) / (n + 1).
  const expectedAfterFive = n0 === 0 ? 5 : (avg0! * n0 + 5) / (n0 + 1);
  await page.getByRole("radio", { name: /appropriateness: 5 of 5/i }).click();
  await expect.poll(readAvg, { timeout: 15_000 }).toBeCloseTo(expectedAfterFive, 1);

  const expectedAfterOne = (expectedAfterFive * (n0 + 1) - 5 + 1) / (n0 + 1);
  await page.getByRole("radio", { name: /appropriateness: 1 of 5/i }).click();
  await expect.poll(readAvg, { timeout: 15_000 }).toBeCloseTo(expectedAfterOne, 1);
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
