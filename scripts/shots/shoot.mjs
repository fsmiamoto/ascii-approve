// Generates README screenshots into assets/ using Playwright's chromium build
// (branded Chrome >= 137 dropped --load-extension).
//
//   node scripts/shots/shoot.mjs
//
// Needs playwright-core with a chromium download. Override the import path with
// PLAYWRIGHT_CORE if yours lives elsewhere.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PW =
  process.env.PLAYWRIGHT_CORE ||
  path.join(os.homedir(), ".local/lib/node_modules/@playwright/cli/node_modules/playwright-core/index.mjs");
const { chromium } = await import(PW);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(ROOT, "assets");
fs.mkdirSync(OUT, { recursive: true });

const mockHtml = fs.readFileSync(path.join(HERE, "mock.html"), "utf8");
const approvedHtml = fs.readFileSync(path.join(HERE, "approved.html"), "utf8");
const hero = fs.readFileSync(path.join(ROOT, "arts/espadon.txt"), "utf8").replace(/\s+$/, "");

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "aa-shots-"));
const ctx = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  viewport: { width: 1280, height: 900 },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`],
});

async function servePage(page, html, dark) {
  const body = dark ? html.replace('data-color-mode="light"', 'data-color-mode="dark"') : html;
  await page.route("https://github.com/**", (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body }));
  await page.goto("https://github.com/acme/turbo-encabulator/pull/42/files");
}

async function shootPicker(dark) {
  const page = await ctx.newPage();
  await servePage(page, mockHtml, dark);
  await page.waitForTimeout(300); // let the content script boot
  await page.click("#open-review");
  await page.waitForSelector(".ascii-approve-host");
  await page.locator(".ascii-approve-host .trigger").click();
  await page.waitForSelector(".ascii-approve-host .panel.open");
  // Hover the Espadon row (deterministic — keyboard racing the input focus is not).
  await page.locator(".ascii-approve-host .item", { hasText: "Espadon" }).hover();
  // Scroll the preview to the fish, not the empty sky above it.
  await page.locator(".ascii-approve-host .preview").evaluate((el) => (el.scrollTop = 140));
  await page.waitForTimeout(150);
  const name = `picker-${dark ? "dark" : "light"}.png`;
  await page.screenshot({ path: path.join(OUT, name) });
  console.log("wrote", name);
  await page.close();
}

async function shootApproved(dark) {
  const page = await ctx.newPage();
  await servePage(page, approvedHtml, dark);
  await page.evaluate((art) => (document.getElementById("art").textContent = art), hero);
  await page.waitForTimeout(100);
  const name = `approved-${dark ? "dark" : "light"}.png`;
  await page.locator(".timeline").screenshot({ path: path.join(OUT, name) });
  console.log("wrote", name);
  await page.close();
}

for (const dark of [false, true]) {
  await shootPicker(dark);
  await shootApproved(dark);
}

await ctx.close();
fs.rmSync(profile, { recursive: true, force: true });
