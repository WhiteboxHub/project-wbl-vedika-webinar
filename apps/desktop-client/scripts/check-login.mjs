import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`${e.message}\n${e.stack || ''}`));
page.on('console', (msg) => {
  const t = msg.text();
  if (msg.type() === 'error' || t.includes('404')) errors.push(`console: ${t}`);
});
page.on('requestfailed', (req) => errors.push(`failed: ${req.url()} ${req.failure()?.errorText}`));
await page.goto('http://localhost:5173/login', { waitUntil: 'domcontentloaded', timeout: 20000 });
await page.waitForTimeout(3000);
const h1 = await page.$eval('h1', (el) => el.textContent).catch(() => null);
const root = await page.$eval('#root', (el) => el.innerHTML).catch(() => '');
console.log('H1:', h1);
console.log('Root HTML length:', root.length);
console.log('Errors:', errors);
await browser.close();
