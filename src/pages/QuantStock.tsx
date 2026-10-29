import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import clsx from 'clsx';
import { Badge, BulletList, ScoreRing, SectionHeader, Segmented, Stat } from '../components/ui';
import { TradeLadder } from '../components/charts';
import { ChangeTag, LiveDot, PriceChart, timeAgo } from '../components/live';
import { WatchButton, flag } from '../components/StockCard';
import { useQuotes } from '../lib/live';
import { horizonMeta, reasons, risks, useResearchStock, type Horizon, type ResearchStock } from '../lib/research';
import { fmtPrice } from '../lib/format';
import type { Market } from '../types';
import { FactorList } from './Picks';
import NotFound from './NotFound';

const pc = (v: number | null | undefined, d = 1) => (v == null ? '—' : `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(d)}%`);
const raw = (v: number | null | undefined, d = 1, suf = '') => (v == null ? '—' : `${v.toFixed(d)}${suf}`);

/** Why a stock is, or isn't, a high-conviction pick. */
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
      ['Near or above its 200-day average', !!(t?.sma200 && t.px > 0.95 * t.sma200)],
      ['No red flags', clean],
    ],
    st: [
      ['Short-term score in the top 10%', (r.st ?? 0) >= 90],
      ['Trend score 75+', (F.trend ?? 0) >= 75],
      ['Price above 50-day, 50-day above 200-day', !!(t?.sma50 && t?.sma200 && t.px > t.sma50 && t.sma50 > t.sma200)],
      ['RSI between 50 and 74', !!(t?.rsi != null && t.rsi >= 50 && t.rsi <= 74)],
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
  const [h, setH] = useState<Horizon | null>(null);
  const cur = market === 'IN' ? '₹' : '$';

  if (loading) return <div className="card card-pad mt-6 h-72 animate-pulse" />;
  if (missing || !r) return <NotFound />;

  const avail = (Object.keys(r.picks ?? {}) as Horizon[]).sort((a, b) => ['st', 'lt', 'sw'].indexOf(a) - ['st', 'lt', 'sw'].indexOf(b));
  const hz = h && avail.includes(h) ? h : avail[0];
  const plan = hz ? r.picks?.[hz] : undefined;
  const price = q?.price ?? r.price ?? r.tech?.px ?? 0;
  const t = r.tech;
  const f = r.fund;
  const g = gates(r);
  const pickLike = { F: r.F, tech: t, fund: f, price, plan, flags: r.flags };
  const strengths = reasons(pickLike, hz ?? 'lt', cur);

  return (
    <div>
      <Link to="/stocks" className="btn-ghost -ml-3 mb-4"><ArrowLeft size={16} /> All {market === 'IN' ? 'Indian' : 'US'} stocks</Link>

      <div className="card card-pad">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-sm text-sub">
              <span>{flag(market)}</span>
              <span className="font-medium">{market === 'IN' ? 'NSE' : 'US'}: {r.symbol}</span>
              {r.sector && <><span>·</span><span>{r.sector}</span></>}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{r.name}</h1>
              <WatchButton id={id} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.cap && <Badge tone="neutral">{r.cap} cap</Badge>}
              {r.idx.map((i) => <Badge key={i} tone="neutral">{i}</Badge>)}
            </div>
            <div className="mt-5 flex flex-wrap items-baseline gap-x-3">
              <span className="num text-4xl font-bold tracking-tight">{price ? fmtPrice(price, market) : '—'}</span>
              <ChangeTag q={q} className="!text-base" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-sub">
              <LiveDot status={status} quote={q} />
              {asOf && <span>· Research updated {timeAgo(asOf)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-center"><ScoreRing score={r.lt ?? 0} size={64} /><div className="mt-1 text-xs text-sub">Long-term rank</div></div>
            <div className="text-center"><ScoreRing score={r.st ?? 0} size={64} /><div className="mt-1 text-xs text-sub">Short-term rank</div></div>
          </div>
        </div>
        <div className={clsx('mt-6 flex flex-wrap items-center gap-2 rounded-xl p-3 text-sm', avail.length ? 'bg-up/10' : 'bg-muted/60')}>
          {avail.length ? (
            <><span className="font-semibold">High-conviction pick:</span>{avail.map((k) => <Badge key={k} tone="up">{horizonMeta[k].label}</Badge>)}</>
          ) : (
            <span className="text-sub"><span className="font-semibold text-fg">No high-conviction signal right now.</span> The checklist below shows which gates it misses.</span>
          )}
        </div>
      </div>

      <div className="mt-8 space-y-10">
        <section>
          <SectionHeader title="Price chart" subtitle="Daily closes from the live data feed" />
          <div className="card card-pad">
            <PriceChart id={id} market={market} reference={[...(plan ? [{ label: 'Target', value: plan.target }, { label: 'Stop', value: plan.stop }] : []), ...(f?.target ? [{ label: 'Analyst target', value: f.target }] : [])]} />
          </div>
        </section>

        <section>
          <SectionHeader title={plan ? 'Trade plan' : 'Pick checklist'} subtitle={plan ? `${horizonMeta[hz!].label} · ${plan.horizon}` : 'What it would take to become a high-conviction pick'} right={avail.length > 1 ? <Segmented size="sm" value={hz!} onChange={setH} options={avail.map((k) => ({ value: k, label: horizonMeta[k].label }))} /> : undefined} />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-3">
              {plan ? (
                <TradeLadder levels={{ entry: plan.entry, target: plan.target, stopLoss: plan.stop, horizon: plan.horizon, rationale: '' }} price={price} market={market} />
              ) : (
                <div className="grid gap-6 sm:grid-cols-2">
                  {(['st', 'lt'] as const).map((k) => (
                    <div key={k}>
                      <div className="label mb-2">{horizonMeta[k].label}</div>
                      <ul className="space-y-2 text-sm">
                        {g[k].map(([label, ok]) => (
                          <li key={label} className={clsx('flex gap-2', !ok && 'text-sub')}>
                            {ok ? <Check size={16} className="mt-0.5 shrink-0 text-up" /> : <X size={16} className="mt-0.5 shrink-0 text-down" />}{label}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
              {plan?.own && (
                <p className="mt-4 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-sub">
                  On this stock, the same {plan.type?.toLowerCase()} setup hit its 2R target first in <span className="num font-semibold text-fg">{Math.round(plan.own.win * 100)}%</span> of {plan.own.n} past signals (average {plan.own.avgR >= 0 ? '+' : ''}{plan.own.avgR.toFixed(2)}R).
                </p>
              )}
            </div>
            <div className="card card-pad space-y-5 lg:col-span-2">
              <div>
                <div className="mb-3 text-sm font-semibold text-up">Strengths</div>
                <BulletList items={strengths.length ? strengths : ['No factor stands out as a clear strength.']} tone="up" />
              </div>
              <div>
                <div className="mb-3 text-sm font-semibold text-down">Risks</div>
                <BulletList items={risks(pickLike, hz ?? 'lt')} tone="down" />
              </div>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader title="Fundamentals & technicals" subtitle="Factor ranks against the whole market, with the underlying numbers" />
          <div className="grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-2">
              <div className="mb-4 text-sm font-semibold">Factor scores</div>
              <FactorList F={r.F} />
            </div>
            <div className="card card-pad lg:col-span-3">
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
                <Stat label="P/E" value={raw(r.pe, 1, 'x')} hint={r.secPe ? `Sector ${r.secPe}x` : undefined} />
                <Stat label="Forward P/E" value={raw(r.fpe, 1, 'x')} hint={r.secFpe ? `Sector ${r.secFpe}x` : undefined} />
                <Stat label="EV / EBITDA" value={raw(f?.evEbitda, 1, 'x')} />
                <Stat label="ROE" value={f?.roe != null ? `${(f.roe * 100).toFixed(0)}%` : '—'} />
                <Stat label="Operating margin" value={f?.opMargin != null ? `${(f.opMargin * 100).toFixed(0)}%` : '—'} />
                <Stat label="Debt / Equity" value={f?.de != null ? `${(f.de / 100).toFixed(2)}x` : '—'} />
                <Stat label="Revenue growth" value={pc(f?.revGrowth, 0)} tone={f?.revGrowth != null ? (f.revGrowth >= 0 ? 'up' : 'down') : undefined} />
                <Stat label="Earnings growth" value={pc(f?.epsGrowth, 0)} tone={f?.epsGrowth != null ? (f.epsGrowth >= 0 ? 'up' : 'down') : undefined} />
                <Stat label="Analyst target" value={f?.target ? fmtPrice(f.target, market) : '—'} hint={f?.target && price ? `${pc(f.target / price - 1, 0)} · ${f.analysts ?? 0} analysts` : undefined} />
                <Stat label="RSI (14)" value={raw(t?.rsi, 0)} hint="50–70 strong, 70+ stretched" />
                <Stat label="vs 200-day avg" value={t?.sma200 ? pc(price / t.sma200 - 1) : '—'} />
                <Stat label="From 52W high" value={pc(t?.from52h)} />
                <Stat label="3-month return" value={pc(t?.r3m)} tone={t?.r3m != null ? (t.r3m >= 0 ? 'up' : 'down') : undefined} />
                <Stat label="12-month return" value={pc(t?.r12m)} tone={t?.r12m != null ? (t.r12m >= 0 ? 'up' : 'down') : undefined} />
                <Stat label="Volatility" value={t?.vol != null ? `${(t.vol * 100).toFixed(0)}%` : '—'} hint="Annualised" />
                <Stat label="Max drawdown" value={pc(t?.dd)} hint="Last 12 months" />
                <Stat label="Trend fit R²" value={raw(t?.trendR2, 2)} hint="0–1, higher = steadier" />
                <Stat label="Next results" value={f?.nextEarnings ? new Date(f.nextEarnings * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'} />
              </div>
            </div>
          </div>
        </section>

        {r.bt && Object.keys(r.bt).length > 0 && (
          <section>
            <SectionHeader title="Swing setups on this stock" subtitle="Breakout and pullback rules replayed over the last 2 years" />
            <div className="card overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Setup</th><th className="!text-right">Past signals</th><th className="!text-right">Hit 2R first</th><th className="!text-right">Average result</th><th>Live now?</th></tr></thead>
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
            <p className="mt-3 text-xs text-sub">R = the risk taken (entry minus stop). A trade wins when it reaches 2R before the stop within 20 trading days; otherwise it’s closed at day 20.</p>
          </section>
        )}
        <p className="text-xs text-sub">Quantitative research from public data, refreshed by the server several times a day. A rule-based model for education, not investment advice.</p>
      </div>
    </div>
  );
}
