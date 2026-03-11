import puppeteer from 'puppeteer';
import { existsSync, mkdirSync, readdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ssDir = join(__dirname, 'temporary screenshots');
if (!existsSync(ssDir)) mkdirSync(ssDir, { recursive: true });

const existing = readdirSync(ssDir).filter(f => f.startsWith('screenshot-'));
let num = 1;
existing.forEach(f => {
  const m = f.match(/screenshot-(\d+)/);
  if (m) num = Math.max(num, parseInt(m[1]) + 1);
});

const label = process.argv[2] || 'admin';
const tab = process.argv[3] || 'hero';
const lang = process.argv[4] || 'en';
const outFile = join(ssDir, `screenshot-${num}-${label}.png`);

(async () => {
  const cacheDir = 'C:/Users/nateh/.cache/puppeteer/';
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    cacheDirectory: cacheDir,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto('http://localhost:3000/admin.html', { waitUntil: 'networkidle2' });

  // Login
  await page.type('#login-user', 'admin');
  await page.type('#login-pass', 'agentpark2025');
  await page.click('#login-form button[type="submit"]');
  await new Promise(r => setTimeout(r, 500));

  // Switch admin UI language if needed
  if (lang === 'am') {
    await page.evaluate(() => adminSetLang('am'));
    await new Promise(r => setTimeout(r, 200));
  }

  // Navigate to Content section
  await page.evaluate(() => showSection('content'));
  await new Promise(r => setTimeout(r, 300));

  // Switch to Armenian editing if needed
  if (lang === 'am') {
    await page.evaluate(() => setAdminLang('am'));
    await new Promise(r => setTimeout(r, 800));
  }

  // Switch tab if not default
  if (tab !== 'hero' && lang !== 'am') {
    await page.evaluate((t) => showContentTab(t), tab);
    await new Promise(r => setTimeout(r, 300));
  }

  await page.screenshot({ path: outFile, fullPage: false });
  console.log('Screenshot saved:', outFile);
  await browser.close();
})();
