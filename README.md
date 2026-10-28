# MarketLens — Stock & IPO Research

A responsive web app for researching **Indian (NSE) and US (NYSE/NASDAQ) stocks** and **Indian mainboard IPOs**. Light and dark themes, no login.

## Features

- **Dashboard**: high-conviction picks, sector outlook (average upside to fair value), and live IPOs.
- **Stock screener**: switch between India and US, filter by sector and rating, search, sort (upside, score, market cap, growth, ROE, P/E), card or table view, and a watchlist saved in your browser.
- **Stock deep-dive** for each company:
  - Analyst rating, conviction and investment thesis
  - **Short-term and long-term trade plans**: entry zone, target, stop loss, reward-to-risk and a visual price ladder
  - *Check with live price*: enter today's price to re-check upside and whether a level has been hit
  - Fundamentals (P/E, forward P/E, P/B, ROE, ROCE, D/E, margins, CAGR, yield, beta) plus a 5-pillar composite score
  - Business model, revenue mix, moats and growth drivers
  - Last 5 quarters of results (chart and table, QoQ/YoY)
  - Annual actuals and 2-year forecast (revenue and EPS)
  - News, deals and regulatory events, each tagged with its likely impact
  - Key risks and a peer comparison
- **IPO desk (India)**: open, upcoming and closed issues with price band, issue structure (fresh vs. OFS), lot size, GMP, financials, ratios, strengths and risks. Each issue gets a scored **Apply / Neutral / Avoid** verdict and links to its sources. Issue status updates automatically from the issue dates. Also lists the big IPO pipeline (Jio, NSE, PhonePe, Flipkart, OYO).
- **Methodology** page explaining ratings, targets and scoring.

## Tech

React 18, TypeScript, Vite, Tailwind CSS, Recharts and React Router (hash routing, so it runs on any static host).

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # static output in dist/
npm run preview
```

You can deploy `dist/` as-is to GitHub Pages, Netlify, Vercel or S3. It needs no server.

## Data

All data lives in `src/data/` as typed TypeScript:

| File | Contents |
| --- | --- |
| `stocksIndia.ts` / `stocksUS.ts` | 12 Indian and 12 US large caps across 10 sectors |
| `ipos.ts` | Current mainboard IPOs (snapshot 28 Oct 2026) and the pipeline |

The stock figures are a **research snapshot (Jun 2026)**. Prices are reference levels, and some financials are rounded or estimated. The IPO data was compiled from public RHP summaries on 28 Oct 2026, and the sources are linked in the app. To refresh the data, edit these files. To add a stock, add another entry that follows the `Stock` type in `src/types.ts`.

A good next step is a small backend or serverless function that pulls live quotes, because browsers block direct calls to most quote APIs (CORS).

## Disclaimer

This app is for education only and is not investment advice. MarketLens is not a SEBI-registered investment adviser or research analyst, and it is not a US-registered adviser. Check exchange filings and RHPs, and consult a registered adviser, before you invest.
