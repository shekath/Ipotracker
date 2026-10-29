import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { findStock, stocks, STOCK_SNAPSHOT } from '../data';
import { Badge, CardHead, ConvictionMeter, Segmented, SegBar, type Tone } from '../components/ui';
import { AnnualChart, QuarterlyChart } from '../components/charts';
import { WatchButton } from '../components/StockCard';
import TradeTicket from '../components/TradeTicket';
import { change, finUnit, fmtDate, fmtFin, fmtMcap, fmtPrice, pct } from '../lib/format';
import { overallScore, ratingTone, stockPillars } from '../lib/scoring';
import type { Impact, Stock } from '../types';
import NotFound from './NotFound';
import QuantStock from './QuantStock';
import { horizonMeta, useResearchStock } from '../lib/research';
import { stockId, useLiveStocks, type LiveStock } from '../lib/live';
import { ChangeTag, LiveDot, PriceChart, timeAgo } from '../components/live';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'results', label: 'Results' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'news', label: 'News & deals' },
  { id: 'peers', label: 'Peers' },
];

const impactTone: Record<Impact, Tone> = { positive: 'up', neutral: 'neutral', negative: 'down' };
const impactDot: Record<Impact, string> = { positive: 'bg-up', neutral: 'bg-sub', negative: 'bg-down' };
const mixColors = ['bg-fg', 'bg-brand', 'bg-brand/50', 'bg-line2', 'bg-sub/50', 'bg-up/60'];

/** First sentence or two of the thesis, for the plain-words verdict line. */
function shortThesis(t: string) {
  const parts = t.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [t];
  let out = '';
  for (const p of parts) {
    if ((out + p).length > 240 && out) break;
    out += p;
  }
  return out.trim();
}

export default function StockDetail() {
  const { market, symbol } = useParams();
  const sym = symbol ? decodeURIComponent(symbol) : undefined;
  const s = findStock(market, sym);
  // Stocks without a written report get the quantitative research page.
  if (!s) return market === 'IN' || market === 'US' ? <QuantStock key={market + sym} market={market} symbol={(sym ?? '').toUpperCase()} /> : <NotFound />;
  return <StockView key={s.market + s.symbol} s={s} />;
}

/** Percentile of `v` among `all` (0–100), higher = better. */
function rank(v: number, all: number[], lowerIsBetter = false) {
  const valid = all.filter((x) => isFinite(x));
  if (valid.length < 3) return undefined;
  const better = valid.filter((x) => (lowerIsBetter ? x > v : x < v)).length;
  return Math.round((better / (valid.length - 1)) * 100);
}

function StockView({ s: base }: { s: Stock }) {
  const one = useMemo(() => [base], [base]);
  const { stocks: [s], status } = useLiveStocks(one);
  const q = s.quote;
  const [horizon, setHorizon] = useState<'short' | 'long'>('short');
  const [qView, setQView] = useState<'table' | 'chart'>('table');
  const levels = horizon === 'short' ? s.shortTerm : s.longTerm;
  const pillars = stockPillars(s);
  const score = overallScore(s);
  const upside = change(s.price, s.fairValue);
  const m = s.metrics;
  const unit = finUnit(s.market);
  const isIN = s.market === 'IN';

  const qs = s.quarters;
  const last = qs[qs.length - 1];
  const prev = qs[qs.length - 2];
  const yoy = qs[0];
  const peers = stocks.filter((p) => p.market === s.market && p.sector === s.sector && p.symbol !== s.symbol);
  const { stocks: livePeers } = useLiveStocks(useMemo(() => peers, [s.symbol])); // eslint-disable-line react-hooks/exhaustive-deps
  const actuals = s.annual.filter((a) => !a.estimate);
  const lastA = actuals[actuals.length - 1];
  const lastE = s.annual[s.annual.length - 1];
  const yrs = s.annual.length - actuals.length;
  const fwdEpsCagr = yrs > 0 && lastA.eps > 0 ? (Math.pow(lastE.eps / lastA.eps, 1 / yrs) - 1) * 100 : 0;
  const fwdRevCagr = yrs > 0 ? (Math.pow(lastE.revenue / lastA.revenue, 1 / yrs) - 1) * 100 : 0;

  // Rank each metric against every researched stock in the same market.
  const universe = stocks.filter((x) => x.market === s.market);
  const marketName = isIN ? 'Indian' : 'US';
  const metricCards: { k: string; v: string; r?: number; note: string }[] = [
    { k: 'P/E (TTM)', v: `${m.pe.toFixed(1)}×`, r: rank(m.pe, universe.map((x) => x.metrics.pe), true), note: 'Price ÷ last 12 months’ earnings' },
    { k: 'Forward P/E', v: `${m.forwardPe.toFixed(1)}×`, r: rank(m.forwardPe, universe.map((x) => x.metrics.forwardPe), true), note: 'Price ÷ next year’s expected earnings' },
    { k: 'ROE', v: `${m.roe}%`, r: rank(m.roe, universe.map((x) => x.metrics.roe)), note: 'Profit earned on shareholders’ money' },
    { k: s.isFinancial ? 'Leverage (A/E)' : 'Debt / equity', v: `${m.debtEquity}×`, r: s.isFinancial ? undefined : rank(m.debtEquity, universe.filter((x) => !x.isFinancial).map((x) => x.metrics.debtEquity), true), note: s.isFinancial ? 'Lenders run higher leverage by design' : 'Lower means a safer balance sheet' },
    { k: 'Net margin', v: `${m.netMargin}%`, r: rank(m.netMargin, universe.map((x) => x.metrics.netMargin)), note: 'Profit kept from each ₹100 of sales'.replace('₹', isIN ? '₹' : '$') },
    { k: 'Revenue CAGR 3Y', v: pct(m.revGrowth3y, 0), r: rank(m.revGrowth3y, universe.map((x) => x.metrics.revGrowth3y)), note: 'Average yearly sales growth' },
    { k: 'EPS CAGR 3Y', v: pct(m.epsGrowth3y, 0), r: rank(m.epsGrowth3y, universe.map((x) => x.metrics.epsGrowth3y)), note: 'Average yearly earnings growth' },
    { k: 'Dividend yield', v: `${m.dividendYield.toFixed(2)}%`, r: rank(m.dividendYield, universe.map((x) => x.metrics.dividendYield)), note: 'Yearly dividend ÷ price' },
  ];

  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[0.8125rem] text-sub">
        <Link to={`/stocks?market=${s.market}`} className="py-1 hover:text-fg">Stocks</Link> /
        <Link to={`/stocks?market=${s.market}&sector=${encodeURIComponent(s.sector)}`} className="py-1 hover:text-fg">{s.sector}</Link> /
        <span className="truncate text-fg">{s.name}</span>
      </div>

      <div className="card">
        {/* Header */}
        <div className="grid gap-5 px-4 pt-5 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl font-semibold tracking-[-0.025em]">
              {s.name}
              <span className="tk font-medium text-sub">{s.symbol} · {s.exchange}</span>
              <WatchButton id={stockId(s)} />
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[s.industry, `Mcap ${fmtMcap(s.marketCap, s.market)}`, `Score ${score}/100`].map((t) => (
                <span key={t} className="rounded-md border border-line bg-muted px-2 py-0.5 text-[0.78125rem] text-fg2">{t}</span>
              ))}
            </div>
          </div>
          <div className="md:text-right">
            <div className="text-[2.125rem] font-semibold leading-none tracking-[-0.035em] tabular-nums">{fmtPrice(s.price, s.market)}</div>
            <div className="mt-1.5"><ChangeTag q={q} abs className="!text-[0.84375rem]" /></div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-sub md:justify-end">
              <LiveDot status={status} quote={q} />
              <span>{q ? `${timeAgo(q.time)}${q.volume ? ` · Vol ${(q.volume / 1e6).toFixed(1)}M` : ''}` : `${STOCK_SNAPSHOT} snapshot`}</span>
            </div>
          </div>
        </div>

        {/* Verdict */}
        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[10px] border border-line bg-muted px-4 py-3.5 sm:mx-6">
          <Badge tone={ratingTone[s.rating]} className="!h-7 !text-[0.84375rem]">{s.rating}</Badge>
          <div>
            <div className="label mb-1">CONVICTION · {s.conviction.toUpperCase()}</div>
            <ConvictionMeter level={s.conviction} />
          </div>
          <p className="min-w-[16rem] flex-1 text-sm text-fg2">
            <b className="text-fg">In plain words:</b> {shortThesis(s.thesis)}{' '}
            {!s.snapshotMismatch && <>Fair value <span className="num font-semibold text-fg">{fmtPrice(s.fairValue, s.market)}</span> (<span className={clsx('num font-semibold', upside >= 0 ? 'text-up' : 'text-down')}>{pct(upside)}</span>).</>}
          </p>
        </div>
        {s.snapshotMismatch && (
          <div className="mx-4 mt-3 flex gap-2 rounded-lg bg-warn/10 p-3 text-xs leading-relaxed text-warn sm:mx-6">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            The live price differs sharply from our research snapshot ({fmtPrice(base.price, s.market)}): possibly a split, bonus or a major move. Valuation metrics and targets below are from the snapshot and need re-checking.
          </div>
        )}

        {/* Section tabs */}
        <div className="no-scrollbar mt-4 flex gap-6 overflow-x-auto border-b border-line px-4 sm:px-6" role="tablist">
          {sections.filter((x) => x.id !== 'peers' || peers.length).map((x, i) => (
            <button key={x.id} role="tab" aria-selected={i === 0} onClick={() => scrollTo(x.id)} className={clsx('relative h-11 shrink-0 whitespace-nowrap text-sm font-medium', i === 0 ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-fg' : 'text-sub hover:text-fg')}>
              {x.label}
            </button>
          ))}
        </div>

        {/* Chart + ticket */}
        <div id="overview" className="grid scroll-mt-28 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 border-line lg:border-r">
            <div className="px-4 pt-4 sm:px-5">
              <PriceChart
                id={stockId(s)}
                name={s.name}
                market={s.market}
                height={320}
                levels={{ zone: levels.entry, zoneLabel: levels.target < levels.entry[0] ? 'EXIT ZONE' : 'BUY ZONE', target: levels.target, stop: levels.stopLoss, fair: s.fairValue }}
              />
            </div>
            <dl className="mt-3 grid grid-cols-3 border-t border-line sm:grid-cols-6">
              {[
                ['52W high', fmtPrice(s.high52, s.market)],
                ['52W low', fmtPrice(s.low52, s.market)],
                ['P/E', `${m.pe.toFixed(1)}`],
                ['P/B', `${m.pb.toFixed(1)}`],
                ['Div. yield', `${m.dividendYield.toFixed(2)}%`],
                ['Beta', m.beta.toFixed(2)],
              ].map(([k, v], i) => (
                <div key={k} className={clsx('px-4 py-3 sm:px-5', i % 3 !== 0 && 'border-l border-line', i >= 3 && 'max-sm:border-t max-sm:border-line', i === 3 && 'sm:border-l sm:border-line')}>
                  <dt className="label">{k}</dt>
                  <dd className="num mt-0.5 text-[0.90625rem] font-medium">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-line px-4 py-5 sm:px-5">
              <h2 className="card-title">How the business makes money</h2>
              <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg2">{s.businessModel}</p>
              <div className="mt-4 flex h-7 gap-0.5 overflow-hidden rounded-[7px]">
                {s.revenueMix.map((r, i) => <i key={r.segment} className={mixColors[i % mixColors.length]} style={{ width: `${r.share}%` }} title={`${r.segment} ${r.share}%`} />)}
              </div>
              <div className="mt-3.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
                {s.revenueMix.map((r, i) => (
                  <div key={r.segment} className="text-[0.8125rem] text-sub">
                    <b className="flex items-center gap-1.5 text-[0.84375rem] font-semibold text-fg"><i className={clsx('h-2 w-2 shrink-0 rounded-sm', mixColors[i % mixColors.length])} /><span className="truncate">{r.segment}</span></b>
                    <span className="num mt-0.5 block text-lg font-semibold text-fg">{r.share}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <aside className="border-t border-line p-4 sm:p-5 lg:border-t-0" aria-label="Trade plan">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="card-title">Trade plan</h2>
              <Segmented size="sm" value={horizon} onChange={setHorizon} options={[{ value: 'short', label: 'Short term' }, { value: 'long', label: 'Long term' }]} />
            </div>
            <TradeTicket key={horizon} levels={levels} price={s.price} market={s.market} fairValue={s.fairValue} />
          </aside>
        </div>
      </div>

      {/* Scorecard + metrics */}
      <div id="fundamentals" className="mt-4 grid scroll-mt-28 gap-4 lg:grid-cols-12">
        <div className="card lg:col-span-5">
          <CardHead title="Research scorecard" right={<span className="num font-semibold">{score}<span className="font-normal text-sub"> / 100</span></span>} />
          <div className="divide-y divide-line">
            {pillars.map((p) => (
              <div key={p.key} className="grid grid-cols-[1fr_auto_34px] items-center gap-3 px-4 py-3 text-sm sm:px-5">
                <span className="min-w-0">{p.label}<small className="block truncate text-[0.78125rem] text-sub">{p.note}</small></span>
                <SegBar score={p.score} />
                <span className="num text-right font-semibold">{p.score}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card lg:col-span-7">
          <CardHead title="Key metrics" sub={`marker = rank among ${universe.length} researched ${marketName} stocks`} />
          <dl className="grid grid-cols-2 sm:grid-cols-4">
            {metricCards.map((c, i) => (
              <div key={c.k} className={clsx('border-line px-4 py-4 sm:px-5', i % 2 === 1 && 'border-l', i >= 2 && 'border-t', 'sm:border-l-0 sm:border-t-0', i % 4 !== 0 && 'sm:border-l', i >= 4 && 'sm:border-t')}>
                <dt className="label">{c.k}</dt>
                <dd className="num mt-1 text-[1.1875rem] font-semibold tracking-[-0.02em]">{c.v}</dd>
                {c.r != null && (
                  <div className="relative mt-2.5 h-1 rounded-full bg-gradient-to-r from-down/25 via-muted to-up/25 ring-1 ring-inset ring-line" title={`Better than ${c.r}% of researched ${marketName} stocks`}>
                    <i className="absolute -top-[3px] h-2.5 w-2.5 -translate-x-1/2 rounded-full border-2 border-surface bg-fg" style={{ left: `${c.r}%` }} />
                  </div>
                )}
                <p className="mt-1.5 text-[0.78125rem] leading-snug text-sub">{c.note}</p>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Results + news */}
      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div id="results" className="card scroll-mt-28 lg:col-span-7">
          <CardHead title="Quarterly results" sub={unit} right={<Segmented size="sm" value={qView} onChange={setQView} options={[{ value: 'table', label: 'Table' }, { value: 'chart', label: 'Chart' }]} />} />
          {qView === 'table' ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Metric</th>{qs.map((r) => <th key={r.period} className="!text-right">{r.period}</th>)}</tr></thead>
                <tbody>
                  {([
                    ['Revenue', (r: (typeof qs)[number]) => r.revenue, false],
                    ['Net profit', (r: (typeof qs)[number]) => r.profit, false],
                    [s.isFinancial ? 'PPOP margin' : 'Op. margin', (r: (typeof qs)[number]) => r.opm, true],
                  ] as const).map(([k, get, isPct]) => (
                    <tr key={k}>
                      <td className="font-medium">{k}</td>
                      {qs.map((r, i) => {
                        const isLast = i === qs.length - 1;
                        const y = isPct ? get(r) - get(yoy) : change(get(yoy), get(r));
                        return (
                          <td key={r.period} className={clsx('num text-right', isLast && 'font-semibold')}>
                            {isPct ? `${get(r)}%` : fmtFin(get(r), s.market)}
                            {isLast && qs.length > 1 && <span className={clsx('block text-xs font-medium', y >= 0 ? 'text-up' : 'text-down')}>{isPct ? `${y >= 0 ? '+' : ''}${Math.round(y * 100)} bps` : pct(y)} vs {yoy.period}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="border-t border-line px-4 py-3 text-xs text-sub sm:px-5">Latest quarter vs. previous: revenue <span className={clsx('num font-semibold', change(prev.revenue, last.revenue) >= 0 ? 'text-up' : 'text-down')}>{pct(change(prev.revenue, last.revenue))}</span>, net profit <span className={clsx('num font-semibold', change(prev.profit, last.profit) >= 0 ? 'text-up' : 'text-down')}>{pct(change(prev.profit, last.profit))}</span>.</p>
            </div>
          ) : (
            <div className="p-4 sm:p-5">
              <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fg" />Revenue (left)</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-brand" />Net profit (right)</span>
              </div>
              <QuarterlyChart data={qs} unit={unit} />
            </div>
          )}
        </div>
        <div id="news" className="card scroll-mt-28 lg:col-span-5">
          <CardHead title="News & deals" />
          <ul className="divide-y divide-line">
            {[...s.news].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6).map((n) => (
              <li key={n.title} className="grid grid-cols-[10px_1fr_auto] items-start gap-3 px-4 py-3 text-sm sm:px-5">
                <span className={clsx('mt-[7px] h-2 w-2 rounded-full', impactDot[n.impact])} />
                <span>{n.title}<small className="mt-0.5 block text-[0.78125rem] text-sub">{n.kind} · {fmtDate(n.date)}</small></span>
                <Badge tone={impactTone[n.impact]} className="capitalize">{n.impact}</Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Forecast */}
      <div id="forecast" className="card mt-4 scroll-mt-28">
        <CardHead title="Growth forecast" sub="annual revenue and EPS · actuals vs. our estimates (E)" />
        <div className="grid lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fg" />Revenue actual</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-fg bg-fg/25" />Revenue estimate</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-warn" />EPS</span>
            </div>
            <AnnualChart data={s.annual} unit={unit} />
          </div>
          <dl className="grid grid-cols-2 content-start border-t border-line lg:border-l lg:border-t-0">
            {[
              ['Fwd revenue CAGR', pct(fwdRevCagr), fwdRevCagr >= 0 ? 'text-up' : 'text-down', `${lastA.year} → ${lastE.year}`],
              ['Fwd EPS CAGR', pct(fwdEpsCagr), fwdEpsCagr >= 0 ? 'text-up' : 'text-down', `${lastA.year} → ${lastE.year}`],
              [`EPS ${lastE.year}`, `${isIN ? '₹' : '$'}${lastE.eps}`, '', 'Our estimate'],
              [`P/E on ${lastE.year}`, `${(s.price / lastE.eps).toFixed(1)}×`, '', 'At today’s price'],
            ].map(([k, v, c, h], i) => (
              <div key={k} className={clsx('px-4 py-4 sm:px-5', i % 2 === 1 && 'border-l border-line', i >= 2 && 'border-t border-line')}>
                <dt className="label">{k}</dt>
                <dd className={clsx('num mt-1 text-lg font-semibold', c)}>{v}</dd>
                <p className="text-xs text-sub">{h}</p>
              </div>
            ))}
            <p className="col-span-2 border-t border-line px-4 py-3 text-xs leading-relaxed text-sub sm:px-5">Base case built from management guidance, segment trends and consensus ranges. EPS is split/bonus adjusted{s.symbol === 'AVGO' ? ' and non-GAAP' : ''}.</p>
          </dl>
        </div>
      </div>

      <QuantCard market={s.market} symbol={s.symbol} />

      {/* Why own / risks */}
      <div className="card mt-4 grid md:grid-cols-2">
        <div className="p-4 sm:p-5">
          <div className="label !text-up">WHY OWN IT</div>
          <ul className="mt-2.5 grid gap-2.5 text-[0.84375rem] leading-relaxed text-fg2">
            {[...s.growthDrivers, ...s.moats].slice(0, 6).map((t) => <li key={t} className="grid grid-cols-[16px_1fr] gap-2"><Check size={16} className="mt-0.5 text-up" />{t}</li>)}
          </ul>
        </div>
        <div className="border-t border-line p-4 sm:p-5 md:border-l md:border-t-0">
          <div className="label !text-down">WHAT COULD GO WRONG</div>
          <ul className="mt-2.5 grid gap-2.5 text-[0.84375rem] leading-relaxed text-fg2">
            {s.risks.map((t) => <li key={t} className="grid grid-cols-[16px_1fr] gap-2"><X size={16} className="mt-0.5 text-down" />{t}</li>)}
          </ul>
        </div>
        <div className="border-t border-line p-4 text-[0.84375rem] leading-relaxed text-fg2 sm:p-5 md:col-span-2">
          <span className="label mr-2">ABOUT</span>{s.about}
        </div>
      </div>

      {/* Peers */}
      {peers.length > 0 && (
        <div id="peers" className="card mt-4 scroll-mt-28">
          <CardHead title="Peer comparison" sub={`${s.sector} · ${isIN ? 'India' : 'US'}`} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Company</th><th className="!text-right">P/E</th><th className="!text-right">Fwd P/E</th><th className="!text-right">ROE</th><th className="!text-right">Net margin</th><th className="!text-right">EPS 3Y</th><th className="!text-right">Upside</th><th className="!text-right">Our view</th></tr></thead>
              <tbody>
                {[s as LiveStock, ...livePeers].map((p) => {
                  const up = change(p.price, p.fairValue);
                  const self = p.symbol === s.symbol;
                  return (
                    <tr key={p.symbol} className={clsx(self && 'bg-muted')}>
                      <td>
                        {self ? <span className="tk">{p.symbol}</span> : <Link to={`/stocks/${p.market}/${encodeURIComponent(p.symbol)}`} className="tk hover:text-brand">{p.symbol}</Link>}
                        <span className="ml-2 text-[0.78125rem] text-sub">{p.name}</span>
                      </td>
                      <td className="num text-right">{p.metrics.pe.toFixed(1)}</td>
                      <td className="num text-right">{p.metrics.forwardPe.toFixed(1)}</td>
                      <td className="num text-right">{p.metrics.roe}%</td>
                      <td className="num text-right">{p.metrics.netMargin}%</td>
                      <td className="num text-right">{pct(p.metrics.epsGrowth3y, 0)}</td>
                      <td className={clsx('num text-right font-semibold', up >= 0 ? 'text-up' : 'text-down')}>{pct(up)}</td>
                      <td className="text-right"><Badge tone={ratingTone[p.rating]}>{p.rating}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/** The quant model's view of a stock that also has a written report. */
function QuantCard({ market, symbol }: { market: 'IN' | 'US'; symbol: string }) {
  const { row } = useResearchStock(market, symbol);
  if (!row) return null;
  const picks = Object.keys(row.picks ?? {}) as ('st' | 'lt' | 'sw')[];
  return (
    <div className="card mt-4">
      <CardHead title="Quant model" sub="factor ranks vs. the whole market" right={<Link to="/picks" className="text-[0.84375rem] font-medium text-brand hover:underline">All picks</Link>} />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-4 text-sm sm:px-5">
        <span>Long-term rank <b className="num">{row.lt ?? '—'}</b></span>
        <span>Short-term rank <b className="num">{row.st ?? '—'}</b></span>
        {(['quality', 'growth', 'value', 'momentum', 'trend'] as const).map((k) => (
          <span key={k} className="text-fg2">{k[0].toUpperCase() + k.slice(1)} <b className="num text-fg">{row.F[k] ?? '—'}</b></span>
        ))}
        <span className="ml-auto flex gap-1.5">
          {picks.length ? picks.map((k) => <Badge key={k} tone="up">{horizonMeta[k].label} pick</Badge>) : <span className="text-[0.8125rem] text-sub">No high-conviction signal from the model right now</span>}
        </span>
      </div>
    </div>
  );
}
