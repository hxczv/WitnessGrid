import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const API = "http://localhost:8787";
const OUT = process.argv[2] || "shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const results = [];

async function probe(name, path, opts = {}) {
  const errors = [];
  const failed = [];
  const badStatus = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
  page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} :: ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400 && !r.url().includes("_next/static")) badStatus.push(`${r.status()} ${r.url()}`); });
  try {
    await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 30000 });
  } catch (e) {
    errors.push(`NAV: ${e.message.split("\n")[0]}`);
  }
  await page.waitForTimeout(1500);
  const shot = `${OUT}/${name}.png`;
  await page.screenshot({ path: shot, fullPage: true });
  results.push({ name, path, errors: [...new Set(errors)], failed: [...new Set(failed)], badStatus: [...new Set(badStatus)], shot });
  page.removeAllListeners("console");
  page.removeAllListeners("pageerror");
  page.removeAllListeners("requestfailed");
  page.removeAllListeners("response");
}

const inc = await (await fetch(`${API}/incidents?limit=1`)).json();
const incidentId = inc.items?.[0]?.id;

await probe("01-home", "/");
await probe("02-map", "/map");
await probe("03-stats", "/stats");
await probe("04-report", "/report");
await probe("05-signin", "/signin");
await probe("06-about", "/about");
await probe("07-contact", "/contact");
await probe("08-privacy", "/privacy");
await probe("09-terms", "/terms");
await probe("10-content-policy", "/content-policy");
if (incidentId) await probe("11-incident", `/incident/${incidentId}`);

const mail = await (await fetch(`http://localhost:8787/`)).text().catch(() => "");
const email = `siteprobe-${Date.now()}@example.com`;
const linkRes = await fetch(`${API}/auth/magic-link`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, username: `siteprobe_${Date.now().toString(36)}` }),
});
if (!linkRes.ok) {
  console.error(`magic-link POST failed: ${linkRes.status} ${await linkRes.text()}`);
}
await page.waitForTimeout(1500);
const log = await import("node:fs").then(() => import("node:fs/promises"));
const devMail = await log.readFile("C:/Users/Administrator/AppData/Local/Temp/opencode/api-dev.log", "utf8");
const lines = devMail.split("\n");
const own = lines.map((l, i) => (l.includes(`to=${email}`) ? i : -1)).filter((i) => i >= 0).at(-1);
const latest = own === undefined ? undefined : lines
  .slice(own, own + 8)
  .map((l) => l.match(/signin\?token=([a-f0-9]+)/)?.[1])
  .find(Boolean);
if (latest) {
  await probe("12-signin-token", `/signin?token=${latest}`);
  await probe("13-profile", "/profile");
} else {
  results.push({ name: "13-profile", path: "/profile", errors: ["SKIPPED: no magic link found"], failed: [], shot: null });
}

const summary = results.map((r) => ({
  name: r.name,
  errors: r.errors.length ? r.errors : [],
  failed: r.failed.length ? r.failed.slice(0, 5) : [],
}));
console.log(JSON.stringify(summary, null, 2));
await browser.close();
