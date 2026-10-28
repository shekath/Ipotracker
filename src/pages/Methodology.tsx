import { STOCK_SNAPSHOT, IPO_SNAPSHOT } from '../data';

const blocks = [
  {
    title: 'Research process',
    body: [
      'Each company is analysed across business model, competitive moats, growth drivers, risks, the last five quarters of results, three years of history and two years of forward estimates.',
      'Fair value combines relative valuation (forward P/E or P/B vs. history and peers), DCF cross-checks and sum-of-the-parts where a company has listed subsidiaries.',
    ],
  },
  {
    title: 'Ratings',
    body: [
      'Strong Buy / Buy: > 15% upside with high business quality. Accumulate: 8–15% upside or high quality with valuation risk — add on dips. Hold: fairly valued. Reduce / Sell: downside risk outweighs upside.',
      'Conviction (High / Medium / Low) reflects earnings visibility and how sensitive the thesis is to macro or regulatory factors.',
    ],
  },
  {
    title: 'Targets & stop losses',
    body: [
      'Short term (1–6 months) levels use price structure — support/resistance, moving averages and recent swing points — anchored to fundamental fair value.',
      'Long term (12–24 months) targets are derived from forward earnings × target multiple; stop losses mark the level at which the investment thesis is invalidated.',
      'Use the “Check with live price” box on each stock page: reference prices are from a research snapshot, so always re-check upside and reward-to-risk before acting.',
    ],
  },
  {
    title: '5-pillar composite score',
    body: [
      'Valuation (22%): PEG ratio = forward P/E ÷ 3-year EPS CAGR. Growth (24%): revenue and EPS CAGR. Profitability (24%): ROE and net margin. Balance sheet (16%): debt/equity (lenders judged on leverage vs. capital). Momentum (14%): position in the 52-week range.',
      'The score is mechanical and deliberately independent of the analyst rating — when they disagree, read the thesis to understand why.',
    ],
  },
  {
    title: 'IPO verdicts',
    body: [
      'Weighted score: business quality 25%, financials 25%, valuation 20%, promoter & issue structure 15%, market signals (GMP, sector sentiment) 15%.',
      'Issues that are mostly offer-for-sale, aggressively priced relative to listed peers, or have extreme customer/supplier concentration are penalised.',
      'New issues are discovered automatically from NSE. Until an analyst reviews the RHP they get a signal-based view: grey-market premium (40%), total subscription (30%) and QIB subscription (30%), on a log scale so 10x counts far more than 2x. GMP alone is capped at “Neutral”.',
    ],
  },
  {
    title: 'Live data',
    body: [
      'Stock prices refresh every minute from Yahoo Finance (optionally Twelve Data) through the site’s own server, so no API keys reach your browser. Prices may be delayed up to 15 minutes depending on the exchange feed.',
      'Valuation multiples (P/E, P/B, yield, market cap) are re-based to the live price; earnings, targets and fair values come from the latest research and change only when the research is updated.',
      'IPO subscription is snapshotted from NSE throughout each bidding day (QIB, NII with bNII/sNII split, retail, employee, shareholder). GMP is collected daily from public trackers and is unofficial.',
    ],
  },
  {
    title: 'Data & limitations',
    body: [
      `Fundamentals and researched IPO analyses are from a research snapshot (stocks ${STOCK_SNAPSHOT}, IPOs ${IPO_SNAPSHOT}). Figures are rounded and some are estimates — verify with company filings and exchange data.`,
      'Indian financials are in ₹ crore; US financials in US$ billions. Indian fiscal years end in March; several US companies have non-calendar fiscal years.',
      'This app runs entirely in your browser — no login, no tracking. Your watchlist and theme preference are stored only on this device.',
    ],
  },
];

export default function Methodology() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Methodology</h1>
      <p className="mt-2 text-sub">How MarketLens produces ratings, targets and IPO recommendations.</p>
      <div className="mt-8 space-y-4">
        {blocks.map((b, i) => (
          <section key={b.title} className="card card-pad">
            <div className="flex items-center gap-3">
              <span className="num flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 text-xs font-bold text-brand">{i + 1}</span>
              <h2 className="text-base font-semibold">{b.title}</h2>
            </div>
            <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-sub">
              {b.body.map((p) => <p key={p}>{p}</p>)}
            </div>
          </section>
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-warn/30 bg-warn/5 p-5 text-sm leading-relaxed">
        <strong>Not investment advice.</strong> MarketLens is an educational tool and is not registered with SEBI as an investment adviser or research analyst, nor with the SEC. Markets carry risk; past performance does not guarantee future returns.
      </div>
    </div>
  );
}
