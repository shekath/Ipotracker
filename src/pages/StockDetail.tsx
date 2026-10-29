import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Briefcase, Calculator, CircleDollarSign, Gauge, Handshake, LineChart, Newspaper, ShieldAlert, TrendingUp } from 'lucide-react';
import clsx from 'clsx';
import { findStock, stocks, STOCK_SNAPSHOT } from '../data';
import { Badge, Bar, BulletList, ScoreRing, SectionHeader, Segmented, Stat, scoreTone, type Tone } from '../components/ui';
import { AnnualChart, MixDonut, QuarterlyChart, RangeBar, TradeLadder } from '../components/charts';
import { WatchButton, flag } from '../components/StockCard';
import { change, finUnit, fmtDate, fmtFin, fmtMcap, fmtPrice, pct } from '../lib/format';
import { overallScore, ratingTone, stockPillars } from '../lib/scoring';
import type { Impact, NewsKind, Stock } from '../types';
import NotFound from './NotFound';
import QuantStock from './QuantStock';
import { stockId, useLiveStocks } from '../lib/live';
import { ChangeTag, LiveDot, PriceChart, timeAgo } from '../components/live';

const sections = [
  { id: 'chart', label: 'Price chart' },
  { id: 'verdict', label: 'Verdict & targets' },
  { id: 'fundamentals', label: 'Fundamentals' },
  { id: 'business', label: 'Business model' },
  { id: 'quarterly', label: 'Quarterly results' },
  { id: 'forecast', label: 'Growth forecast' },
  { id: 'news', label: 'News & deals' },
  { id: 'risks', label: 'Risks' },
  { id: 'peers', label: 'Peers' },
];

const impactTone: Record<Impact, Tone> = { positive: 'up', neutral: 'neutral', negative: 'down' };
const kindIcon: Record<NewsKind, typeof Newspaper> = { Results: LineChart, Deal: Handshake, Corporate: Briefcase, Regulatory: ShieldAlert, Product: TrendingUp };

export default function StockDetail() {
  const { market, symbol } = useParams();
  const sym = symbol ? decodeURIComponent(symbol) : undefined;
  const s = findStock(market, sym);
  // Stocks without a written report get the quantitative research page.
  if (!s) return market === 'IN' || market === 'US' ? <QuantStock key={market + sym} market={market} symbol={(sym ?? '').toUpperCase()} /> : <NotFound />;
  return <StockView key={s.market + s.symbol} s={s} />;
}

function StockView({ s: base }: { s: Stock }) {
  const one = useMemo(() => [base], [base]);
  const { stocks: [s], status } = useLiveStocks(one);
  const q = s.quote;
  const [horizon, setHorizon] = useState<'short' | 'long'>('short');
  const [cmpInput, setCmpInput] = useState('');
  const cmp = Number(cmpInput) > 0 ? Number(cmpInput) : s.price;
  const levels = horizon === 'short' ? s.shortTerm : s.longTerm;
  const pillars = stockPillars(s);
  const score = overallScore(s);
  const upside = change(cmp, s.fairValue);
  const m = s.metrics;
  const unit = finUnit(s.market);

  const levelAlert = useMemo(() => {
    if (!cmpInput && !q) return null;
    const bearish = levels.target < levels.entry[0];
    const slHit = bearish ? cmp >= levels.stopLoss : cmp <= levels.stopLoss;
    const tgtHit = bearish ? cmp <= levels.target : cmp >= levels.target;
    if (slHit) return { tone: 'down' as const, text: 'Price has breached the stop loss — thesis invalidated for this horizon. Re-evaluate before acting.' };
    if (tgtHit) return { tone: 'up' as const, text: 'Price has reached the target — consider booking profits or trailing the stop.' };
    if (cmp < levels.entry[0] || cmp > levels.entry[1]) return { tone: 'warn' as const, text: 'Price is outside the suggested entry zone — wait for a better entry or size smaller.' };
    return { tone: 'up' as const, text: 'Price is inside the suggested entry zone.' };
  }, [cmp, cmpInput, q, levels]);

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

  const metricRows: { label: string; value: string; hint?: string }[] = [
    { label: 'P/E (TTM)', value: `${m.pe.toFixed(1)}x` },
    { label: 'Forward P/E', value: `${m.forwardPe.toFixed(1)}x` },
    { label: 'P/B', value: `${m.pb.toFixed(1)}x` },
    { label: 'ROE', value: `${m.roe}%` },
    ...(m.roce ? [{ label: 'ROCE', value: `${m.roce}%` }] : []),
    { label: s.isFinancial ? 'Leverage (A/E)' : 'Debt / Equity', value: `${m.debtEquity}x` },
    { label: s.isFinancial ? 'PPOP margin' : 'Operating margin', value: `${m.opMargin}%` },
    { label: 'Net margin', value: `${m.netMargin}%` },
    { label: 'Revenue CAGR 3Y', value: pct(m.revGrowth3y, 0) },
    { label: 'EPS CAGR 3Y', value: pct(m.epsGrowth3y, 0) },
    { label: 'Dividend yield', value: `${m.dividendYield.toFixed(2)}%` },
    { label: 'Beta', value: m.beta.toFixed(1) },
  ];

  return (
    <div>
      <Link to={`/stocks?market=${s.market}`} className="btn-ghost -ml-3 mb-4"><ArrowLeft size={16} /> All {s.market === 'IN' ? 'Indian' : 'US'} stocks</Link>

      {/* Header */}
      <div className="card card-pad">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-sub">
              <span>{flag(s.market)}</span>
              <span className="font-medium">{s.exchange}: {s.symbol}</span>
              <span>·</span>
              <Link to={`/stocks?market=${s.market}&sector=${encodeURIComponent(s.sector)}`} className="hover:text-brand">{s.sector}</Link>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{s.name}</h1>
              <WatchButton id={`${s.market}:${s.symbol}`} />
            </div>
            <p className="mt-1 text-sm text-sub">{s.industry}</p>
            <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-3">
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="num text-4xl font-bold tracking-tight">{fmtPrice(s.price, s.market)}</span>
                  {q && <span className={q.change >= 0 ? 'num text-base font-semibold text-up' : 'num text-base font-semibold text-down'}>{q.change >= 0 ? '+' : ''}{q.change.toFixed(2)}</span>}
                  <ChangeTag q={q} className="!text-base" />
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-sub">
                  <LiveDot status={status} quote={q} />
                  <span>{q ? `· ${q.source} · ${timeAgo(q.time)}${q.dayLow && q.dayHigh ? ` · Day ${fmtPrice(q.dayLow, s.market)} – ${fmtPrice(q.dayHigh, s.market)}` : ''}` : `· Reference price, ${STOCK_SNAPSHOT} snapshot`}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pb-1">
                <Badge tone={ratingTone[s.rating]} className="!text-sm !px-3 !py-1">{s.rating}</Badge>
                <Badge tone="neutral" className="!text-sm !px-3 !py-1">{s.conviction} conviction</Badge>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-4 lg:w-[30rem] lg:grid-cols-2">
            <Stat label="Market cap" value={fmtMcap(s.marketCap, s.market)} />
            <Stat label="Fair value" value={fmtPrice(s.fairValue, s.market)} hint={<span className={upside >= 0 ? 'text-up' : 'text-down'}>{pct(upside)} from price</span>} />
            <Stat label="P/E · Fwd" value={`${m.pe.toFixed(0)}x · ${m.forwardPe.toFixed(0)}x`} />
            <div className="flex items-center gap-3">
              <ScoreRing score={score} size={56} />
              <div className="text-xs text-sub">Composite<br />score</div>
            </div>
          </div>
        </div>
        {s.snapshotMismatch && (
          <div className="mt-5 flex gap-2 rounded-xl bg-warn/10 p-3 text-xs leading-relaxed text-warn">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            The live price differs sharply from our research snapshot ({fmtPrice(base.price, s.market)}) — possibly a split, bonus or major move. Valuation metrics and targets below are from the snapshot and need re-checking.
          </div>
        )}
        <div className="mt-6 border-t border-line pt-5">
          <RangeBar low={s.low52} high={s.high52} price={s.price} fair={s.fairValue} market={s.market} />
        </div>
      </div>

      {/* Section nav */}
      <div className="sticky top-16 z-30 -mx-4 mt-6 border-b border-line bg-bg/85 px-4 backdrop-blur-xl sm:mx-0 sm:rounded-xl sm:border sm:px-2">
        <div className="flex gap-1 overflow-x-auto py-2 no-scrollbar">
          {sections.filter((x) => x.id !== 'peers' || peers.length).map((x) => (
            <a key={x.id} href={`#${x.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(x.id)?.scrollIntoView({ behavior: 'smooth' }); }} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-sub hover:bg-muted hover:text-fg">
              {x.label}
            </a>
          ))}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        <section>
          <SectionHeader id="chart" title="Price chart" subtitle="Daily closes from the live data feed" />
          <div className="card card-pad">
            <PriceChart id={stockId(s)} market={s.market} reference={[{ label: 'Fair value', value: s.fairValue }, { label: 'ST target', value: s.shortTerm.target }, { label: 'LT target', value: s.longTerm.target }]} />
          </div>
        </section>

        {/* Verdict */}
        <section>
          <SectionHeader id="verdict" title="Analyst verdict & trade plan" subtitle="Targets and stop losses for short-term and long-term horizons" />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-semibold"><Gauge size={16} className="text-brand" /> Investment thesis</div>
              <p className="mt-3 text-[15px] leading-relaxed">{s.thesis}</p>
              <div className="mt-6 rounded-xl border border-line p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Calculator size={16} className="text-brand" /> What-if price</div>
                <p className="mt-1 text-xs text-sub">{q ? 'Levels use the live price. Try another price to test entries and exits.' : 'Enter today’s market price to re-check upside and level status.'}</p>
                <div className="relative mt-3">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-sub">{s.market === 'IN' ? '₹' : '$'}</span>
                  <input type="number" inputMode="decimal" min="0" step="any" className="input num pl-8" placeholder={String(s.price)} value={cmpInput} onChange={(e) => setCmpInput(e.target.value)} aria-label="Current market price" />
                </div>
                {levelAlert && (
                  <div className={clsx('mt-3 flex gap-2 rounded-lg p-3 text-xs leading-relaxed', levelAlert.tone === 'down' ? 'bg-down/10 text-down' : levelAlert.tone === 'warn' ? 'bg-warn/10 text-warn' : 'bg-up/10 text-up')}>
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {levelAlert.text}
                  </div>
                )}
              </div>
            </div>
            <div className="card card-pad lg:col-span-3">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold"><CircleDollarSign size={16} className="text-brand" /> Trade plan</div>
                <Segmented size="sm" value={horizon} onChange={setHorizon} options={[{ value: 'short', label: 'Short term' }, { value: 'long', label: 'Long term' }]} />
              </div>
              <TradeLadder levels={levels} price={cmp} market={s.market} />
            </div>
          </div>
        </section>

        {/* Fundamentals */}
        <section>
          <SectionHeader id="fundamentals" title="Fundamentals & scorecard" subtitle="Key valuation, profitability and growth metrics" />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                {metricRows.map((r) => <Stat key={r.label} label={r.label} value={r.value} />)}
              </div>
            </div>
            <div className="card card-pad lg:col-span-2">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm font-semibold">5-pillar scorecard</div>
                <Badge tone={scoreTone(score)}>{score}/100</Badge>
              </div>
              <div className="space-y-4">
                {pillars.map((p) => (
                  <div key={p.key}>
                    <div className="mb-1.5 flex items-center justify-between text-sm">
                      <span className="font-medium">{p.label}</span>
                      <span className="num font-semibold">{p.score}</span>
                    </div>
                    <Bar value={p.score} tone={scoreTone(p.score)} />
                    <div className="mt-1 text-xs text-sub">{p.note}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Business */}
        <section>
          <SectionHeader id="business" title="Business model" />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="card card-pad space-y-5">
              <div>
                <div className="label">About</div>
                <p className="mt-2 text-sm leading-relaxed">{s.about}</p>
              </div>
              <div>
                <div className="label">How it makes money</div>
                <p className="mt-2 text-sm leading-relaxed">{s.businessModel}</p>
              </div>
            </div>
            <div className="card card-pad">
              <div className="label mb-4">Revenue mix</div>
              <MixDonut data={s.revenueMix} />
            </div>
            <div className="card card-pad">
              <div className="mb-4 text-sm font-semibold">Competitive moats</div>
              <BulletList items={s.moats} tone="brand" />
            </div>
            <div className="card card-pad">
              <div className="mb-4 text-sm font-semibold">Growth drivers</div>
              <BulletList items={s.growthDrivers} tone="up" />
            </div>
          </div>
        </section>

        {/* Quarterly */}
        <section>
          <SectionHeader id="quarterly" title="Quarterly results" subtitle={`Revenue and net profit, ${unit}`} />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: `Revenue ${last.period}`, v: fmtFin(last.revenue, s.market), qoq: change(prev.revenue, last.revenue), yoy: change(yoy.revenue, last.revenue) },
              { label: `Net profit ${last.period}`, v: fmtFin(last.profit, s.market), qoq: change(prev.profit, last.profit), yoy: change(yoy.profit, last.profit) },
              { label: `Op. margin ${last.period}`, v: `${last.opm}%`, qoq: last.opm - prev.opm, yoy: last.opm - yoy.opm, bps: true },
            ].map((k) => (
              <div key={k.label} className="card p-5">
                <div className="label">{k.label}</div>
                <div className="num mt-2 text-2xl font-bold">{k.v}{!k.bps && <span className="ml-1 text-sm font-medium text-sub">{unit}</span>}</div>
                <div className="mt-2 flex gap-4 text-xs">
                  <span className="text-sub">QoQ <span className={clsx('num font-semibold', k.qoq >= 0 ? 'text-up' : 'text-down')}>{k.bps ? `${k.qoq >= 0 ? '+' : ''}${Math.round(k.qoq * 100)} bps` : pct(k.qoq)}</span></span>
                  <span className="text-sub">YoY <span className={clsx('num font-semibold', k.yoy >= 0 ? 'text-up' : 'text-down')}>{k.bps ? `${k.yoy >= 0 ? '+' : ''}${Math.round(k.yoy * 100)} bps` : pct(k.yoy)}</span></span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-3">
              <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Revenue (left)</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />Net profit (right)</span>
              </div>
              <QuarterlyChart data={qs} unit={unit} />
            </div>
            <div className="card overflow-x-auto lg:col-span-2">
              <table className="table-base">
                <thead><tr><th>Quarter</th><th className="!text-right">Revenue</th><th className="!text-right">Profit</th><th className="!text-right">OPM</th></tr></thead>
                <tbody>
                  {[...qs].reverse().map((r) => (
                    <tr key={r.period}>
                      <td className="font-medium">{r.period}</td>
                      <td className="num text-right">{fmtFin(r.revenue, s.market)}</td>
                      <td className="num text-right">{fmtFin(r.profit, s.market)}</td>
                      <td className="num text-right text-sub">{r.opm}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Forecast */}
        <section>
          <SectionHeader id="forecast" title="Growth forecast" subtitle="Annual revenue and EPS — actuals vs. MarketLens estimates (E)" />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-3">
              <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Revenue actual</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-brand bg-brand/30" />Revenue estimate</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" />EPS</span>
              </div>
              <AnnualChart data={s.annual} unit={unit} />
            </div>
            <div className="card card-pad grid grid-cols-2 content-start gap-5 lg:col-span-2">
              <Stat label="Fwd revenue CAGR" value={pct(fwdRevCagr)} tone={fwdRevCagr >= 0 ? 'up' : 'down'} hint={`${lastA.year} → ${lastE.year}`} />
              <Stat label="Fwd EPS CAGR" value={pct(fwdEpsCagr)} tone={fwdEpsCagr >= 0 ? 'up' : 'down'} hint={`${lastA.year} → ${lastE.year}`} />
              <Stat label={`EPS ${lastE.year}`} value={`${s.market === 'IN' ? '₹' : '$'}${lastE.eps}`} />
              <Stat label={`P/E on ${lastE.year}`} value={`${(s.price / lastE.eps).toFixed(1)}x`} />
              <p className="col-span-2 text-xs leading-relaxed text-sub">Estimates reflect our base case using management guidance, segment trends and consensus ranges. EPS figures are split/bonus adjusted{s.symbol === 'AVGO' ? ' and non-GAAP' : ''}.</p>
            </div>
          </div>
        </section>

        {/* News */}
        <section>
          <SectionHeader id="news" title="Latest news, deals & events" subtitle="Material developments and their likely impact" />
          <div className="card divide-y divide-line">
            {[...s.news].sort((a, b) => b.date.localeCompare(a.date)).map((n) => {
              const Icon = kindIcon[n.kind];
              return (
                <div key={n.title} className="flex gap-4 p-4 sm:p-5">
                  <span className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.impact === 'positive' ? 'bg-up/10 text-up' : n.impact === 'negative' ? 'bg-down/10 text-down' : 'bg-muted text-sub')}>
                    <Icon size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
                      <span className="num">{fmtDate(n.date)}</span>
                      <span>·</span>
                      <span>{n.kind}</span>
                      <Badge tone={impactTone[n.impact]} className="ml-auto capitalize">{n.impact}</Badge>
                    </div>
                    <p className="mt-1 text-sm font-medium leading-relaxed">{n.title}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Risks */}
        <section>
          <SectionHeader id="risks" title="Key risks" subtitle="What could break the thesis" />
          <div className="card card-pad"><BulletList items={s.risks} tone="down" /></div>
        </section>

        {/* Peers */}
        {peers.length > 0 && (
          <section>
            <SectionHeader id="peers" title="Peer comparison" subtitle={`${s.sector} · ${s.market === 'IN' ? 'India' : 'US'}`} />
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Company</th><th className="!text-right">P/E</th><th className="!text-right">Fwd P/E</th><th className="!text-right">ROE</th><th className="!text-right">Net margin</th><th className="!text-right">EPS 3Y</th><th>Rating</th><th className="!text-right">Upside</th></tr></thead>
                <tbody>
                  {[s, ...livePeers].map((p) => {
                    const up = change(p.price, p.fairValue);
                    return (
                      <tr key={p.symbol} className={clsx(p.symbol === s.symbol && 'bg-brand/5')}>
                        <td>
                          {p.symbol === s.symbol ? <span className="font-semibold">{p.symbol}</span> : <Link to={`/stocks/${p.market}/${encodeURIComponent(p.symbol)}`} className="font-semibold hover:text-brand">{p.symbol}</Link>}
                          <span className="ml-2 text-xs text-sub">{p.name}</span>
                        </td>
                        <td className="num text-right">{p.metrics.pe.toFixed(1)}</td>
                        <td className="num text-right">{p.metrics.forwardPe.toFixed(1)}</td>
                        <td className="num text-right">{p.metrics.roe}%</td>
                        <td className="num text-right">{p.metrics.netMargin}%</td>
                        <td className="num text-right">{pct(p.metrics.epsGrowth3y, 0)}</td>
                        <td><Badge tone={ratingTone[p.rating]}>{p.rating}</Badge></td>
                        <td className={clsx('num text-right font-semibold', up >= 0 ? 'text-up' : 'text-down')}>{pct(up)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
