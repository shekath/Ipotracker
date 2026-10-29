// Clicks through the app like a visitor and fails on any navigation that
// doesn't change page or that logs an error. Needs Playwright (preinstalled in
// the dev container; elsewhere: npm i -D playwright && npx playwright install chromium).
// Usage: node tests/nav-smoke.cjs [baseUrl]   (default http://127.0.0.1:4173)
const { chromium } = require('playwright');

const base = process.argv[2] || 'http://127.0.0.1:4173';
const steps = [
  ['header Picks', 'header nav >> text=Picks', 'High-conviction picks'],
  ['pick card', 'main a[href*="#/stocks/IN/"] >> nth=0', null],
  ['header Stocks', 'header nav >> text=Stocks', 'Stock research'],
  ['header Screener', 'header nav >> text=Screener', 'Index screener'],
  ['header IPOs', 'header nav >> text=IPOs', 'IPO desk'],
  ['IPO card', 'a[href*="#/ipo/"] >> nth=0', null],
  ['back to IPO desk', 'text=IPO desk', 'IPO desk'],
  ['header Dashboard', 'header nav >> text=Dashboard', 'Institutional-grade'],
  ['hero Explore stocks', 'text=Explore stocks', 'Stock research'],
  ['stock card', 'a[href*="#/stocks/IN/"] >> nth=0', null],
  ['logo', 'header a >> nth=0', 'Institutional-grade'],
  ['index card', 'a[href*="#/screener?index="] >> nth=0', 'Index screener'],
  ['header Weekly Targets', 'header nav >> a[href="#/weekly-targets"]', 'Weekly index targets'],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !/fonts\.g/.test(m.text()) && errors.push(m.text()));
  await page.goto(base + '/#/', { waitUntil: 'networkidle' });
  let failed = 0;
  for (const [name, selector, expectH1] of steps) {
    const before = page.url();
    let h1 = '';
    try {
      await page.click(selector);
      await page.waitForTimeout(500);
      h1 = (await page.locator('h1').first().textContent()) || '';
    } catch (e) {
      h1 = `(error: ${e.message.split('\n')[0]})`;
    }
    const ok = page.url() !== before && h1 && !h1.startsWith('(error') && (!expectH1 || h1.includes(expectH1));
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(20)} ${page.url().replace(base, '')} | ${h1.slice(0, 50)}`);
  }
  if (errors.length) {
    failed++;
    console.log('Console errors:\n  ' + [...new Set(errors)].join('\n  '));
  }
  await browser.close();
  console.log(failed ? `${failed} problem(s)` : 'ALL NAVIGATION OK');
  process.exit(failed ? 1 : 0);
})();
