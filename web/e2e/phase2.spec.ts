import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";
import { signIn } from "./helpers";
import type { IncidentType } from "../src/lib/contract";
import { PIN_TYPE_COLORS } from "../src/lib/map-pins";

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
      isStyleLoaded(): boolean;
      hasImage(id: string): boolean;
      getCanvas(): HTMLCanvasElement;
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

// Regression: pins are bottom-tip anchored — the incident's exact projected
// pixel is the tip (nothing renders below it), and the pin body hangs above.
// maplibre's symbol query/collision machinery is unusable at this app's zoom
// (collision boxes span the viewport, placements flicker mid-rebuild), so this
// test asserts on what the user actually sees — painted pixels — and reads pin
// positions from the source data (placement-independent).
test("incident pins sit exactly on their coordinates", async ({ page }) => {
  page.on("console", (m) => {
    if (m.type() === "error") console.log("TEST-CONSOLE-ERR", m.text().slice(0, 300));
  });
  page.on("pageerror", (e) => console.log("TEST-PAGEERROR", String(e).slice(0, 300)));
  await page.goto("/map");
  await expect(page.getByTestId("map").locator("canvas")).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async () => {
    type ProbeMap = {
      loaded(): boolean;
      once(event: string, cb: () => void): unknown;
      easeTo(opts: { center: [number, number]; zoom: number }): unknown;
    };
    const getMap = () => (globalThis as { __wgMap?: ProbeMap }).__wgMap;
    let map = getMap();
    for (let i = 0; !map && i < 20; i++) {
      await new Promise<void>((r) => setTimeout(r, 250));
      map = getMap();
    }
    if (!map) return;
    if (!map.loaded()) await new Promise<void>((r) => void map.once("load", r));
    await new Promise<void>((r) => void map.once("idle", r));
    // Zoom in on a known seed incident — the default z5.5 view clusters
    // everything, and a plain zoom at the old centre ends up over empty sea.
    map.easeTo({ center: [-1.258, 51.752], zoom: 8 });
  });
  const canvas = page.getByTestId("map").locator("canvas");
  // Readiness = pins visibly painted (placement-independent truth).
  let pinPixels = 0;
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(500);
    const buf = await canvas.screenshot();
    const png = PNG.sync.read(buf);
    pinPixels = 0;
    const palette = [
      [255, 179, 0], [79, 195, 247], [255, 138, 101], [206, 147, 216],
      [229, 115, 115], [129, 199, 132], [144, 164, 174], [232, 163, 61],
    ];
    for (let j = 0; j < png.data.length; j += 4) {
      const r = png.data[j]!;
      const g = png.data[j + 1]!;
      const b = png.data[j + 2]!;
      if (
        palette.some(
          ([pr, pg, pb]) =>
            pr !== undefined &&
            pg !== undefined &&
            pb !== undefined &&
            Math.abs(r - pr) < 40 &&
            Math.abs(g - pg) < 40 &&
            Math.abs(b - pb) < 40,
        )
      ) pinPixels++;
    }
    console.log("PIN-PIXELS", i, pinPixels);
    if (pinPixels > 1000) break;
  }
  expect(pinPixels, "pin pixels must be painted on the canvas").toBeGreaterThan(1000);
  // Wait until the zoomed-in camera settles: the source re-clusters on
  // moveend, so poll until the free-pin list is stable across two reads.
  const readPins = () =>
    page.evaluate(() => {
      type ProbeMap = {
        project(pos: [number, number]): { x: number; y: number };
        querySourceFeatures(src: string): unknown[];
      };
      const map = (globalThis as { __wgMap?: ProbeMap }).__wgMap;
      if (!map) return { ok: false as const, reason: "no map", checked: [], others: [] };
      const feats = map.querySourceFeatures("incidents") as {
        properties: { id?: unknown; incident_type?: unknown; point_count?: unknown };
        geometry: { type: string; coordinates: [number, number] };
      }[];
      const pins = feats
        .filter((f) => f.geometry.type === "Point" && !f.properties.point_count)
        .slice(0, 6)
        .map((f) => {
          const p = map.project(f.geometry.coordinates);
          return {
            id: String(f.properties.id ?? ""),
            type: String(f.properties.incident_type ?? "other"),
            px: Math.round(p.x),
            py: Math.round(p.y),
          };
        });
      const others = feats
        .filter((f) => f.geometry.type === "Point")
        .map((f) => {
          const p = map.project(f.geometry.coordinates);
          return { x: Math.round(p.x), y: Math.round(p.y) };
        });
      return {
        ok: true as const,
        zoom: (map as unknown as { getZoom(): number }).getZoom(),
        domDiag: {
          mapContainers: document.querySelectorAll('[data-testid="map"]').length,
          canvases: document.querySelectorAll("canvas").length,
          wgMapCanvasConnected: (
            map as unknown as { getCanvas(): HTMLCanvasElement }
          ).getCanvas().isConnected,
        },
        totals: {
          all: feats.length,
          clusters: feats.filter((f) => f.properties.point_count).length,
          singles: feats.filter((f) => !f.properties.point_count).length,
        },
        layersPresent: ["incident-pin", "incident-cluster-pin", "incident-cluster-count"].every(
          (id) =>
            (map as unknown as { getStyle(): { layers: { id: string }[] } })
              .getStyle()
              .layers.some((l) => l.id === id),
        ),
        checked: pins,
        others,
      };
    });
  let result = await readPins();
  let prevKey = "";
  for (let i = 0; i < 24; i++) {
    console.log("PIN-READ", i, JSON.stringify({ zoom: result.zoom, domDiag: result.domDiag, totals: result.totals, n: result.checked?.length }));
    const key = JSON.stringify(result.checked?.map((p) => `${p.id}@${p.px},${p.py}`) ?? []);
    if (result.ok && key !== "" && key === prevKey) break;
    prevKey = key;
    await page.waitForTimeout(500);
    result = await readPins();
  }
  expect(result.ok, JSON.stringify(result)).toBe(true);
  expect(result.layersPresent).toBe(true);
  expect(result.checked.length).toBeGreaterThan(0);
  // The pin tips are painted exactly at the projected coordinates: the
  // bottom-most fill pixel must land within 4px of the projected point.
  const buf = await canvas.screenshot();
  const png = PNG.sync.read(buf);
  const { width: imgW, height: imgH, data: img } = png;
  const pxAt = (x: number, y: number) => {
    const i = (y * imgW + x) * 4;
    return [img[i]!, img[i + 1]!, img[i + 2]!] as const;
  };
  for (const pin of result.checked) {
    const hex =
      (PIN_TYPE_COLORS as Record<string, string>)[pin.type] ?? PIN_TYPE_COLORS.other;
    const fr = parseInt(hex.slice(1, 3), 16);
    const fg = parseInt(hex.slice(3, 5), 16);
    const fb = parseInt(hex.slice(5, 7), 16);
    const { width: cw, height: ch } = await canvas.evaluate((cv) => {
      const c = cv as HTMLCanvasElement;
      return { width: c.width, height: c.height };
    });
    const scaleX = imgW / cw;
    const scaleY = imgH / ch;
    const sx = Math.round(pin.px * scaleX);
    const sy = Math.round(pin.py * scaleY);
    let tipY = -1;
    let fillPixels = 0;
    for (let y = Math.max(0, sy - 50); y <= Math.min(imgH - 1, sy + 2); y++) {
      for (let x = sx - 14; x <= sx + 14; x++) {
        const [r, g, b] = pxAt(x, y);
        if (Math.abs(r - fr) < 45 && Math.abs(g - fg) < 45 && Math.abs(b - fb) < 45) {
          fillPixels++;
          if (y > tipY) tipY = y;
        }
      }
    }
    expect(fillPixels, `pin ${pin.id} must paint on the map: ${JSON.stringify(pin)}`).toBeGreaterThan(50);
    expect(
      Math.abs(tipY - sy) <= 4,
      `tip of ${pin.id} must sit on its coordinate (tipY=${tipY}, py=${sy}): ${JSON.stringify(pin)}`,
    ).toBe(true);
  }
  // Real-click behaviour: clicking empty map space must NOT open a pin, and a
  // click at a pin's tip must open that exact incident.
  const box = await canvas.boundingBox();
  if (!box) throw new Error("map canvas has no bounding box");
  const target = result.checked[0]!;
  const clickAt = async (px: number, py: number) => {
    await page.mouse.click(box.x + px, box.y + py);
    await page.waitForTimeout(300);
  };
  // Empty spot: farthest point from every incident, at least 60px away.
  const all = [
    ...(result.checked ?? []).map((p) => ({ x: p.px, y: p.py })),
    ...(result.others ?? []),
  ];
  let empty = { x: 200, y: 200, dist: -1 };
  for (let x = 80; x < 960; x += 40) {
    for (let y = 80; y < 640; y += 40) {
      const d = Math.min(...all.map((p) => Math.hypot(p.x - x, p.y - y)));
      if (d > empty.dist) empty = { x, y, dist: d };
    }
  }
  expect(empty.dist, "empty click point must be far from every pin").toBeGreaterThan(60);
  await clickAt(empty.x, empty.y);
  await expect(page).toHaveURL(/\/map(\?.*)?$/);
  await clickAt(target.px, target.py);
  await expect(page).toHaveURL(new RegExp(`/incident/${target.id}`), { timeout: 15_000 });
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
