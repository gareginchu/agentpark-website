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

const label = process.argv[2] || 'admin-scroll';
const scrollY = parseInt(process.argv[3] || '600');
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

  await page.type('#login-user', 'admin');
  await page.type('#login-pass', 'agentpark2025');
  await page.click('#login-form button[type="submit"]');
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => adminSetLang('am'));
  await new Promise(r => setTimeout(r, 200));
  await page.evaluate(() => showSection('content'));
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => setAdminLang('am'));
  await new Promise(r => setTimeout(r, 800));

  // Scroll down
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await new Promise(r => setTimeout(r, 200));

  await page.screenshot({ path: outFile, fullPage: false });
  console.log('Screenshot saved:', outFile);
  await browser.close();
})();
