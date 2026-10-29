import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { Badge, CardHead, Segmented, SegBar } from '../components/ui';
import TradeTicket from '../components/TradeTicket';
import { ChangeTag, LiveDot, PriceChart, timeAgo } from '../components/live';
import { WatchButton } from '../components/StockCard';
import { useQuotes } from '../lib/live';
import { factorHelp, factorLabel, horizonMeta, reasons, risks, useResearchStock, type Factors, type Horizon, type ResearchStock } from '../lib/research';
import { fmtPrice, pct } from '../lib/format';
import type { Market } from '../types';
import NotFound from './NotFound';

const pc = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`);
const raw = (v: number | null | undefined, d = 1, suf = '') => (v == null ? '—' : `${v.toFixed(d)}${suf}`);

/** Gate checklist: why a stock is, or isn't, a high-conviction pick. */
function gates(r: ResearchStock): Record<'lt' | 'st', [string, boolean][]> {
  const t = r.tech;
  const F = r.F;
  const clean = !r.flags.some((f) => !f.startsWith('Results due'));
  return {
    lt: [
      ['Long-term score in the top 10%', (r.lt ?? 0) >= 90],
      ['Quality above 60', (F.quality ?? 0) >= 60],
      ['Growth above 55', (F.growth ?? 0) >= 55],
      ['Momentum not weak (40+)', (F.momentum ?? 0) >= 40],
      ['Not in a downtrend (near or above 200-day average)', !!(t?.sma200 && t.px > 0.95 * t.sma200)],
      ['No red flags', clean],
    ],
    st: [
      ['Short-term score in the top 10%', (r.st ?? 0) >= 90],
      ['Trend score 75+', (F.trend ?? 0) >= 75],
      ['Price above 50-day, 50-day above 200-day', !!(t?.sma50 && t?.sma200 && t.px > t.sma50 && t.sma50 > t.sma200)],
      ['RSI between 50 and 74 (strong, not stretched)', !!(t?.rsi != null && t.rsi >= 50 && t.rsi <= 74)],
      ['Within 12% of the 52-week high', (t?.from52h ?? -1) > -0.12],
      ['No red flags', clean],
    ],
  };
}

export default function QuantStock({ market, symbol }: { market: Market; symbol: string }) {
  const { row: r, asOf, missing, loading } = useResearchStock(market, symbol);
  const id = `${market}:${symbol}`;
  const { quotes, status } = useQuotes(useMemo(() => [id], [id]));
  const q = quotes[id];
  const avail = (Object.keys(r?.picks ?? {}) as Horizon[]).sort((a, b) => ['st', 'lt', 'sw'].indexOf(a) - ['st', 'lt', 'sw'].indexOf(b));
  const [h, setH] = useState<Horizon | null>(null);
  const cur = market === 'IN' ? '₹' : '$';

  if (loading) return <div className="card mt-6 h-72 animate-pulse" />;
  if (missing || !r) return <NotFound />;

  const hz = h && avail.includes(h) ? h : avail[0];
  const plan = hz ? r.picks?.[hz] : undefined;
  const price = q?.price ?? r.price ?? r.tech?.px ?? 0;
  const t = r.tech;
  const f = r.fund;
  const g = gates(r);
  const pickLike = { F: r.F, tech: t, fund: f, price, plan, flags: r.flags };

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[0.8125rem] text-sub">
        <Link to="/stocks" className="py-1 hover:text-fg">Stocks</Link> /
        {r.sector && <><Link to={`/stocks?sector=${encodeURIComponent(r.sector)}`} className="py-1 hover:text-fg">{r.sector}</Link> /</>}
        <span className="truncate text-fg">{r.name}</span>
      </div>

      <div className="card">
        <div className="grid gap-5 px-4 pt-5 sm:px-6 md:grid-cols-[1fr_auto] md:items-end">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-2xl font-semibold tracking-[-0.025em]">
              {r.name}
              <span className="tk font-medium text-sub">{r.symbol} · {market === 'IN' ? 'NSE' : 'US'}</span>
              <WatchButton id={id} />
            </h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[r.sector, r.cap && `${r.cap} cap`, ...r.idx].filter(Boolean).map((x) => (
                <span key={x as string} className="rounded-md border border-line bg-muted px-2 py-0.5 text-[0.78125rem] text-fg2">{x}</span>
              ))}
            </div>
          </div>
          <div className="md:text-right">
            <div className="text-[2.125rem] font-semibold leading-none tracking-[-0.035em] tabular-nums">{price ? fmtPrice(price, market) : '—'}</div>
            <div className="mt-1.5">{q ? <ChangeTag q={q} abs className="!text-[0.84375rem]" /> : r.chg != null && <span className={clsx('num text-sm font-semibold', r.chg >= 0 ? 'text-up' : 'text-down')}>{pct(r.chg, 2)}</span>}</div>
            <div className="mt-1.5 flex items-center gap-2 text-xs text-sub md:justify-end"><LiveDot status={status} quote={q} />{asOf && <span>Research {timeAgo(asOf)}</span>}</div>
          </div>
        </div>

        <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line bg-muted px-4 py-3.5 sm:mx-6">
          {avail.length ? (
            <>
              <span className="text-sm font-semibold">High-conviction:</span>
              {avail.map((k) => <Badge key={k} tone="up" className="!h-7 !text-[0.84375rem]">{horizonMeta[k].label}</Badge>)}
            </>
          ) : (
            <span className="text-sm text-fg2"><b className="text-fg">No high-conviction signal right now.</b> The checklist below shows which gates it misses.</span>
          )}
          <span className="ml-auto flex gap-4 text-[0.8125rem] text-sub">
            <span>Long-term rank <b className="num text-fg">{r.lt ?? '—'}</b></span>
            <span>Short-term rank <b className="num text-fg">{r.st ?? '—'}</b></span>
          </span>
        </div>

        <div className="mt-4 grid border-t border-line lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0 px-4 pt-4 sm:px-5 lg:border-r lg:border-line">
            <PriceChart id={id} name={r.name} market={market} height={320} levels={plan ? { zone: plan.entry, target: plan.target, stop: plan.stop, fair: f?.target ?? undefined } : f?.target ? { fair: f.target } : undefined} />
            <div className="pb-4" />
          </div>
          <aside className="border-t border-line p-4 sm:p-5 lg:border-t-0" aria-label="Trade plan">
            {plan && hz ? (
              <>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h2 className="card-title">Trade plan</h2>
                  {avail.length > 1 && <Segmented size="sm" value={hz} onChange={setH} options={avail.map((k) => ({ value: k, label: horizonMeta[k].label }))} />}
                </div>
                <TradeTicket key={hz} levels={{ entry: plan.entry, target: plan.target, stopLoss: plan.stop, horizon: plan.horizon, rationale: reasons(pickLike, hz, cur).join(' ') }} price={price} market={market} fairValue={f?.target ?? plan.target} />
              </>
            ) : (
              <>
                <h2 className="card-title mb-2">Pick checklist</h2>
                {(['st', 'lt'] as const).map((k) => (
                  <div key={k} className="mt-3">
                    <div className="label mb-1.5">{horizonMeta[k].label.toUpperCase()}</div>
                    <ul className="grid gap-1.5 text-[0.8125rem]">
                      {g[k].map(([label, ok]) => (
                        <li key={label} className={clsx('grid grid-cols-[16px_1fr] gap-2', ok ? 'text-fg2' : 'text-sub')}>
                          {ok ? <Check size={15} className="mt-0.5 text-up" /> : <X size={15} className="mt-0.5 text-down" />}{label}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            )}
          </aside>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="card lg:col-span-5">
          <CardHead title="Factor scores" sub="percentile vs. the whole market" />
          <div className="divide-y divide-line">
            {(Object.keys(factorLabel) as (keyof Factors)[]).map((k) => (
              <div key={k} className="grid grid-cols-[1fr_auto_34px] items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
                <span className="min-w-0">{factorLabel[k]}<small className="block truncate text-[0.75rem] text-sub" title={factorHelp[k]}>{factorHelp[k]}</small></span>
                {r.F[k] != null ? <SegBar score={r.F[k] as number} /> : <span className="w-28 text-right text-xs text-sub">no data</span>}
                <span className="num text-right font-semibold">{r.F[k] ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card lg:col-span-7">
          <CardHead title="What the data says" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <div>
              <div className="label !text-up">STRENGTHS</div>
              <ul className="mt-1.5 grid gap-1.5 text-[0.84375rem] leading-relaxed text-fg2">
                {(reasons(pickLike, hz ?? 'lt', cur).length ? reasons(pickLike, hz ?? 'lt', cur) : ['No factor stands out as a clear strength.']).map((x) => <li key={x} className="grid grid-cols-[16px_1fr] gap-2"><Check size={15} className="mt-0.5 text-up" />{x}</li>)}
              </ul>
            </div>
            <div>
              <div className="label !text-down">RISKS</div>
              <ul className="mt-1.5 grid gap-1.5 text-[0.84375rem] leading-relaxed text-fg2">
                {risks(pickLike, hz ?? 'lt').map((x) => <li key={x} className="grid grid-cols-[16px_1fr] gap-2"><AlertTriangle size={14} className="mt-0.5 text-warn" />{x}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card">
          <CardHead title="Technicals" sub="daily, last 2 years" />
          <dl className="grid grid-cols-2 sm:grid-cols-3">
            {([
              ['RSI (14)', raw(t?.rsi, 0), '50–70 is strong; above 70 is stretched'],
              ['vs 50-day avg', t?.sma50 ? pc(price / t.sma50 - 1) : '—', 'Above = short-term uptrend'],
              ['vs 200-day avg', t?.sma200 ? pc(price / t.sma200 - 1) : '—', 'Above = long-term uptrend'],
              ['1 month', pc(t?.r1m), 'Price return'],
              ['3 months', pc(t?.r3m), 'Price return'],
              ['12 months', pc(t?.r12m), 'Price return'],
              ['From 52W high', pc(t?.from52h), 'Distance below the high'],
              ['Volatility', t?.vol != null ? `${(t.vol * 100).toFixed(0)}%` : '—', 'Annualised, last 3 months'],
              ['Max drawdown', pc(t?.dd), 'Worst fall in 12 months'],
              ['ATR (14)', t?.atr != null ? `${cur}${t.atr.toFixed(t.atr < 10 ? 2 : 0)}` : '—', 'Typical daily range'],
              ['Trend fit R²', raw(t?.trendR2, 2), '6-month straightness, 0–1'],
              ['Volume trend', t?.volRatio != null ? `${t.volRatio.toFixed(2)}×` : '—', '20-day vs 50-day average'],
            ] as const).map(([k, v, hint], i) => (
              <div key={k} className={clsx('border-line px-4 py-3 sm:px-5', i % 2 === 1 && 'border-l', i >= 2 && 'border-t', 'sm:border-l-0 sm:border-t-0', i % 3 !== 0 && 'sm:border-l', i >= 3 && 'sm:border-t')}>
                <dt className="label">{k}</dt>
                <dd className="num mt-0.5 font-semibold">{v}</dd>
                <p className="text-[0.75rem] text-sub">{hint}</p>
              </div>
            ))}
          </dl>
        </div>
        <div className="card">
          <CardHead title="Fundamentals" sub={f?.analysts ? `${f.analysts} analysts` : undefined} />
          <dl className="grid grid-cols-2 sm:grid-cols-3">
            {([
              ['P/E', raw(r.pe, 1, '×'), r.secPe ? `Sector median ${r.secPe}×` : 'Trailing 12 months'],
              ['Forward P/E', raw(r.fpe, 1, '×'), r.secFpe ? `Sector median ${r.secFpe}×` : 'Next 12 months'],
              ['EV / EBITDA', raw(f?.evEbitda, 1, '×'), 'Lower is cheaper'],
              ['ROE', pc(f?.roe, 0).replace('+', ''), 'Return on equity'],
              ['Operating margin', pc(f?.opMargin, 0).replace('+', ''), 'Profit before interest and tax'],
              ['Debt / equity', f?.de != null ? `${(f.de / 100).toFixed(2)}×` : '—', 'Lower is safer'],
              ['Revenue growth', pc(f?.revGrowth, 0), 'Year on year'],
              ['Earnings growth', pc(f?.epsGrowth, 0), 'Year on year'],
              ['Analyst target', f?.target ? fmtPrice(f.target, market) : '—', f?.target && price ? `${pc(f.target / price - 1, 0)} vs price` : 'Average target'],
              ['Consensus', f?.rec != null ? (f.rec <= 1.8 ? 'Strong buy' : f.rec <= 2.5 ? 'Buy' : f.rec <= 3.5 ? 'Hold' : 'Sell') : '—', f?.rec != null ? `${f.rec.toFixed(1)} on a 1–5 scale` : 'Analyst rating'],
              ['Dividend yield', r.dy != null ? `${r.dy.toFixed(2)}%` : '—', 'Trailing 12 months'],
              ['Next results', f?.nextEarnings ? new Date(f.nextEarnings * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—', 'Expect bigger moves around results'],
            ] as const).map(([k, v, hint], i) => (
              <div key={k} className={clsx('border-line px-4 py-3 sm:px-5', i % 2 === 1 && 'border-l', i >= 2 && 'border-t', 'sm:border-l-0 sm:border-t-0', i % 3 !== 0 && 'sm:border-l', i >= 3 && 'sm:border-t')}>
                <dt className="label">{k}</dt>
                <dd className="num mt-0.5 font-semibold">{v}</dd>
                <p className="text-[0.75rem] text-sub">{hint}</p>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {r.bt && Object.keys(r.bt).length > 0 && (
        <div className="card mt-4">
          <CardHead title="Swing setups on this stock" sub="replayed over the last 2 years" />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Setup</th><th className="!text-right">Past signals</th><th className="!text-right">Hit 2R target first</th><th className="!text-right">Average result</th><th>Live now?</th></tr></thead>
              <tbody>
                {Object.entries(r.bt).map(([k, s]) => (
                  <tr key={k}>
                    <td className="font-medium">{k}</td>
                    <td className="num text-right">{s.n}</td>
                    <td className="num text-right">{Math.round(s.win * 100)}%</td>
                    <td className={clsx('num text-right font-semibold', s.avgR >= 0 ? 'text-up' : 'text-down')}>{s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R</td>
                    <td>{r.setup === k ? <Badge tone="brand">Yes</Badge> : <span className="text-sub">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-line px-4 py-3 text-xs text-sub sm:px-5">R = the risk taken (entry minus stop). A trade wins when it reaches 2R before the stop within 20 trading days; otherwise it’s closed at day 20. Same-day ties count as losses.</p>
        </div>
      )}
      <p className="mt-4 text-xs text-sub">Quantitative research from public data, updated by the server several times a day. It is a rule-based model for education, not investment advice.</p>
    </div>
  );
}
