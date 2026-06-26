/**
 * Smoke test: login page renders without JS errors.
 * Usage: node scripts/verify-ui.mjs [baseUrl]
 */
import puppeteer from 'puppeteer';

const baseUrl = process.argv[2] || 'http://localhost:5173';
const loginUrl = `${baseUrl}/login`;

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [];

page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
});

await page.goto(loginUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForSelector('h1', { timeout: 10000 }).catch(() => null);

const h1 = await page.$eval('h1', (el) => el.textContent).catch(() => null);
const hasEmailInput = await page.$('#email') !== null;
const rootLen = await page.$eval('#root', (el) => el.innerHTML.length).catch(() => 0);

await browser.close();

const ok = h1 === 'Organizer Portal' && hasEmailInput && rootLen > 0 && errors.length === 0;

console.log(JSON.stringify({ ok, loginUrl, h1, hasEmailInput, rootLen, errors }, null, 2));
process.exit(ok ? 0 : 1);
