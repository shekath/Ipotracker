# MarketLens — Stock & IPO Research

A responsive web app for researching **Indian (NSE) and US (NYSE/NASDAQ) stocks** and **Indian mainboard IPOs**. Light and dark themes, no login.

## Features

- **Live prices** for every stock (refreshed each minute), day change and a 1M–5Y price chart.
- **India-first market tabs**: the dashboard, stock list and screener switch between 🇮🇳 India (default) and 🇺🇸 US, and the choice is remembered.
- **Index screener**: Nifty 50, Nifty Next 50, Nifty 100, Nifty 200, Nifty Midcap 100, Sensex, Bank Nifty, Nifty IT/Pharma/Auto/FMCG, Dow 30 and US mega caps. Every member shows live price, day change, market cap, P/E, P/B, dividend yield and 52-week position, with breadth, presets (gainers, losers, near 52W high/low, value, dividend) and industry filters.
- **Dashboard**: high-conviction picks, sector outlook (average upside to fair value), and live IPOs.
- **Stock screener**: switch between India and US, filter by sector and rating, search, sort (upside, score, market cap, growth, ROE, P/E), card or table view, and a watchlist saved in your browser.
- **Stock deep-dive** for each company:
  - Analyst rating, conviction and investment thesis
  - **Short-term and long-term trade plans**: entry zone, target, stop loss, reward-to-risk and a visual price ladder
  - Alerts when the live price enters the entry zone, hits the target or breaks the stop loss, plus a *what-if price* box
  - Fundamentals (P/E, forward P/E, P/B, ROE, ROCE, D/E, margins, CAGR, yield, beta) plus a 5-pillar composite score
  - Business model, revenue mix, moats and growth drivers
  - Last 5 quarters of results (chart and table, QoQ/YoY)
  - Annual actuals and 2-year forecast (revenue and EPS)
  - News, deals and regulatory events, each tagged with its likely impact
  - Key risks and a peer comparison
- **IPO desk (India)**: new mainboard and SME IPOs are **added automatically when announced**, with a full listing timeline (open, close, allotment, refund, demat credit, listing), **day-wise subscription** by QIB / NII (bNII and sNII) / retail / employee category, and a **daily GMP** trend. Each issue shows with price band, issue structure (fresh vs. OFS), lot size, GMP, financials, ratios, strengths and risks. Researched issues get a scored **Apply / Neutral / Avoid** verdict with sources; auto-discovered ones get a market-signal view. Also lists the big IPO pipeline (Jio, NSE, PhonePe, Flipkart, OYO).
- **Weekly index targets** (menu: *Weekly Index Targets*): Nifty 50, Nifty Bank and Sensex levels for the present week from last week's high, low, close and India VIX. The page shows the pivot (last week's average), whether price is above or below it, the next target, a draggable price rail for what-if prices, and the upside / downside targets at Range ÷ 4, ÷ 2 or the full range. Inputs fill automatically and can be edited; the current price defaults to the last session's close.
- **Methodology** page explaining ratings, targets and scoring.

## Live data

The site includes a small **PHP backend** in `api/`, which runs on any cPanel or Hostinger plan. It needs no database, Node.js or API keys.

| Endpoint | What it does |
| --- | --- |
| `api/quotes.php?ids=IN:RELIANCE,US:AAPL` | Live quotes (Yahoo Finance, with a second Yahoo host and optional Twelve Data as fallbacks). Cached for 60 s. |
| `api/history.php?id=IN:TCS&range=1y` | Price history for the chart (`1mo`, `6mo`, `1y`, `5y`). |
| `api/ipos.php` | IPOs discovered automatically from NSE (mainboard and SME), with day-wise subscription by category (QIB, NII, bNII, sNII, retail, employee, shareholder), daily GMP and the T+3 listing timeline. |
| `api/cron/update-ipos.php` | Refresh job for the IPO data. Run it from cron, or call it as a URL with a token. |
| `api/screener.php?index=nifty50` | Index members with live price, market cap, P/E, P/B and dividend yield. Official member lists come from niftyindices.com (cached 24 h), with bundled lists in `data/indices.json` as fallback. |
| `api/weekly.php` | Previous completed week's high / low / close for Nifty 50, Nifty Bank and Sensex plus India VIX high / low, the present week so far and the last session's close (Yahoo weekly and daily candles, cached 5 min). Feeds the Weekly index targets page; `data/weekly-snapshot.json` is the fallback without PHP. |
| `api/health.php` | Setup diagnostics: PHP version, extensions, whether the data folder is writable, and the status of each source. |

How it behaves:
- **Stocks:** prices refresh every minute while the tab is open. P/E, P/B, yield and market cap are re-based to the live price. Fair values and targets come from the research data.
- **IPOs:** a new issue appears as soon as NSE lists it as upcoming. Subscription is snapshotted on every run during bidding, and the morning after close captures the final figures. Each day keeps its last snapshot, which gives the Day 1/2/3 table. GMP is matched by company name from the trackers in `gmp_sources`. Issues that appear only on GMP trackers (for example BSE-only issues) are tracked too.
- **Verdicts:** issues in `src/data/ipos.ts` keep their full fundamental verdict and are enriched with live data. Auto-discovered issues get a signal-based view from GMP, total subscription and QIB subscription. GMP alone is capped at Neutral.
- **No PHP?** The site still works and shows the research-snapshot data.

## Deploy to Hostinger (cPanel or hPanel)

1. **Build the package** on your computer (Node 18+):
   ```bash
   npm install
   npm run package        # creates marketlens-hostinger.zip
   ```
2. **Upload:** open *File Manager*, go to `public_html` (or a subfolder for a subdirectory install), upload `marketlens-hostinger.zip` and choose *Extract*. Make sure `index.html`, `.htaccess`, `assets/` and `api/` end up directly inside `public_html`. Hidden files such as `.htaccess` must be included.
3. **PHP version:** in *Select PHP Version* (cPanel) or *Advanced → PHP Configuration* (hPanel), choose **PHP 8.1 or newer** and make sure the `curl`, `dom` and `json` extensions are enabled. They usually are by default.
4. **Optional settings:** create `public_html/api/config.local.php`:
   ```php
   <?php return [
     'cron_token' => 'paste-a-long-random-string',   // only needed for URL-based cron
     'twelvedata_key' => '',                          // optional quote fallback (free tier at twelvedata.com)
   ];
   ```
   Redeploys never overwrite this file.
5. **Cron job** (keeps IPO subscription and GMP current):
   - cPanel: *Cron Jobs*, "Every 15 minutes", with this command:
     `/usr/local/bin/php /home/YOUR_CPANEL_USER/public_html/api/cron/update-ipos.php >/dev/null 2>&1`
     (the PHP path may also be `/usr/bin/php`)
   - hPanel: *Advanced → Cron Jobs*, type *PHP*, path `public_html/api/cron/update-ipos.php`, every 15 minutes.
   - If you skip cron, the data still refreshes automatically when someone visits the IPO page and the last update is more than 20 minutes old.
6. **Check it:** open `https://your-domain/api/health.php`. `dataDirWritable` should be `true`, and the sources should show `ok` after the first refresh.

**Updating later:** run `npm run package` again and extract the zip over the existing files. `api/data/` (the IPO history) and `config.local.php` are left untouched.

### Current deployment: stocks.shekathali.com

The live site is in `public_html/stocks` (the `stocks.shekathali.com` subdomain). It is deployed with Hostinger's Git deploy from the `hostinger-deploy` branch, which contains only the built site.
- **Update:** on `main`, run `npm run deploy:branch` (add `-- --dry-run` to preview without pushing), then redeploy (hPanel → Advanced → Git → Deploy). Each build is committed on top of the current `hostinger-deploy` tip and pushed without force, so the server's `git pull` is always a fast-forward. If the build hasn't changed, nothing is pushed. `api/data/` and `config.local.php` are untracked, so they are kept.
- **Cron:** `*/15 * * * * /usr/bin/php /home/u321045870/domains/shekathali.com/public_html/stocks/api/cron/update-ipos.php`

### Troubleshooting
- **NSE source shows an error:** NSE sometimes rate-limits or blocks shared-hosting IP addresses. GMP-based discovery keeps working, and NSE usually recovers on its own. If the error persists, ask Hostinger support whether outbound requests to `www.nseindia.com` are allowed.
- **Quotes missing:** check `health.php`. If Yahoo is blocked from your server, add a Twelve Data key.
- **GMP missing:** tracker sites change their HTML from time to time. Update or add URLs in `gmp_sources` (in `config.local.php`). Any page with an HTML table that has an IPO-name column and a "GMP" column works.

## Development

```bash
npm install
npm run dev:api   # PHP backend on :8000 (needs PHP 8.1+ locally)
npm run dev       # http://localhost:5173 (proxies /api to :8000)
npm run test:api  # offline end-to-end tests of the PHP backend against mock upstreams
npm run build     # static output in dist/ (includes api/)
```

Stack: React 18, TypeScript, Vite, Tailwind CSS, Recharts, React Router (hash routing) and a PHP 8 backend.

## Research data

The research lives in `src/data/` as typed TypeScript:

| File | Contents |
| --- | --- |
| `stocksIndia.ts` / `stocksUS.ts` | 12 Indian and 12 US large caps: fundamentals, quarterly results, forecasts, news, targets |
| `ipos.ts` | Researched IPO verdicts (snapshot 28 Oct 2026) and the big-ticket pipeline |

Fundamentals and targets are a research snapshot (Jun 2026), and some figures are rounded or estimated. To add a stock, append an entry that follows the `Stock` type in `src/types.ts`. Live prices are picked up automatically using the NSE symbol (Indian stocks) or the ticker (US stocks).

## Disclaimer

This app is for education only and is not investment advice. MarketLens is not a SEBI-registered investment adviser or research analyst, and it is not a US-registered adviser. Check exchange filings and RHPs, and consult a registered adviser, before you invest.
