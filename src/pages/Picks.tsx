import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Info, Radio } from 'lucide-react';
import clsx from 'clsx';
import { Badge, Bar, BulletList, ScoreRing, Segmented, scoreTone } from '../components/ui';
import { TradeLadder } from '../components/charts';
import { ChangeTag, LiveDot, timeAgo } from '../components/live';
import { useQuotes, type FeedStatus } from '../lib/live';
import { marketTabs } from '../components/Flag';
import { useMarketPref } from '../lib/marketPref';
import { factorLabel, horizonMeta, reasons, risks, useResearch, type Factors, type Horizon, type Pick, type ResearchData } from '../lib/research';
import { fmtPrice, pct } from '../lib/format';
import type { LiveQuote, Market } from '../types';

const order: Horizon[] = ['st', 'lt', 'sw'];

/** Market regime and research coverage, in the style of the IPO desk's feed strip. */
export function RegimeStrip({ data }: { data: ResearchData }) {
  const r = data.regime;
  const on = r.state === 'risk-on';
  const off = r.state === 'risk-off';
  return (
    <div className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-xs', on ? 'border-up/30 bg-up/5' : off ? 'border-down/30 bg-down/5' : 'border-warn/30 bg-warn/5')}>
      <span className="flex items-center gap-1.5 font-semibold">
        <Radio size={13} className={on ? 'text-up' : off ? 'text-down' : 'text-warn'} />
        {r.state === 'unknown' ? 'Regime unknown' : on ? 'Risk-on market' : off ? 'Risk-off market' : 'Mixed market'}
      </span>
      <span className="text-sub">{r.label}. Picks need the top {100 - r.bar}% of the ranking.</span>
      <span className="text-sub sm:ml-auto">{data.coverage.history} of {data.universe} stocks analysed · updated {timeAgo(data.asOf)}</span>
    </div>
  );
}

export function FactorList({ F }: { F: Factors }) {
  return (
    <div className="space-y-2.5">
      {(Object.keys(factorLabel) as (keyof Factors)[]).map((k) => (
        <div key={k}>
          <div className="mb-1 flex justify-between text-xs"><span className="font-medium">{factorLabel[k]}</span><span className="num font-semibold">{F[k] ?? '—'}</span></div>
          {F[k] != null ? <Bar value={F[k] as number} tone={scoreTone(F[k] as number)} /> : <div className="h-1.5 rounded-full bg-muted" />}
        </div>
      ))}
    </div>
  );
}

function PickCard({ p, h, market, rank, quote, status }: { p: Pick; h: Horizon; market: Market; rank: number; quote?: LiveQuote; status: FeedStatus }) {
  const cur = market === 'IN' ? '₹' : '$';
  const plan = p.plan;
  // Live last traded price when the feed has it, else the research snapshot.
  const price = quote?.price ?? p.price ?? (plan.entry[0] + plan.entry[1]) / 2;
  const chg = quote?.changePct ?? p.chg;
  const why = reasons(p, h, cur);
  return (
    <article className="card card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
            <span className="num">#{rank}</span>
            <span>{p.sector ?? '—'}</span>
            {p.cap && <><span>·</span><span>{p.cap} cap</span></>}
            {p.idx.slice(0, 2).map((i) => <Badge key={i} tone="neutral">{i}</Badge>)}
          </div>
          <h3 className="mt-1.5 text-lg font-semibold">
            <Link to={`/stocks/${market}/${encodeURIComponent(p.symbol)}`} className="hover:text-brand">{p.symbol}</Link>
            <span className="ml-2 text-sm font-normal text-sub">{p.name}</span>
          </h3>
          <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-sub">LTP</span>
            <span className="num text-xl font-bold">{fmtPrice(price, market)}</span>
            {quote ? <ChangeTag q={quote} /> : chg != null && <span className={clsx('num text-sm font-semibold', chg >= 0 ? 'text-up' : 'text-down')}>{chg >= 0 ? '▲' : '▼'} {pct(chg, 2)}</span>}
            <LiveDot status={status} quote={quote} className="self-center" />
          </div>
        </div>
        <div className="flex items-center gap-3">
          {plan.type && <Badge tone="brand">{plan.type}</Badge>}
          <Badge tone="up">{horizonMeta[h].label}</Badge>
          {plan.score != null && <ScoreRing score={plan.score} size={48} />}
        </div>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-3">
          <TradeLadder levels={{ entry: plan.entry, target: plan.target, stopLoss: plan.stop, horizon: plan.horizon, rationale: '' }} price={price} market={market} />
          {plan.pool && (
            <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs leading-relaxed text-sub">
              Across the market, {plan.type?.toLowerCase()} signals in the last 2 years averaged <span className="num font-semibold text-fg">{plan.pool.avgR >= 0 ? '+' : ''}{plan.pool.avgR.toFixed(2)}R</span> over {plan.pool.n.toLocaleString('en-IN')} trades.
            </p>
          )}
        </div>
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <div>
            <div className="label mb-2">Why it qualifies</div>
            <BulletList items={why.length ? why : ['Top-ranked on the combined score for this horizon.']} tone="up" />
          </div>
          <div>
            <div className="label mb-2">What could go wrong</div>
            <BulletList items={risks(p, h)} tone="down" />
          </div>
        </div>
      </div>

      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-medium text-sub hover:text-fg">Factor scores</summary>
        <div className="mt-3 max-w-md"><FactorList F={p.F} /></div>
      </details>
    </article>
  );
}

export default function Picks() {
  const [market, setMarket] = useMarketPref();
  const { data, error, loading } = useResearch(market);
  const [h, setH] = useState<Horizon>('st');
  const [params, setParams] = useSearchParams();
  const cap = params.get('cap') ?? 'All';
  const setCap = (c: string) => setParams(c === 'All' ? {} : { cap: c }, { replace: true });
  const caps = useMemo(() => ['Mega', 'Large', 'Mid', 'Small', 'Micro'].filter((c) => data?.rows.some((r) => r.cap === c)), [data]);
  // The server keeps the 12 strongest per cap size; "All sizes" shows the 12 strongest overall.
  const of = (k: Horizon) => {
    const all = data?.picks[k] ?? [];
    return cap === 'All' ? all.slice(0, 12) : all.filter((p) => p.cap === cap).slice(0, 12);
  };
  const list = of(h);
  const ids = list.map((p) => `${market}:${p.symbol}`).join(',');
  const { quotes, status } = useQuotes(useMemo(() => (ids ? ids.split(',') : []), [ids]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">High-conviction picks</h1>
          <p className="mt-1 max-w-2xl text-sm text-sub">
            Every {market === 'IN' ? 'Indian stock in the Nifty Total Market' : 'S&P 500 and Nasdaq-100 stock'} is scored daily on fundamentals and technicals. Only the few that clear every gate appear here, with an entry zone, target and stop loss.
          </p>
        </div>
        <Segmented value={market} onChange={(m) => { setMarket(m); setCap('All'); }} options={marketTabs} />
      </div>

      {loading && !data ? (
        <div className="card card-pad h-64 animate-pulse" />
      ) : !data ? (
        <div className="card card-pad flex gap-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Info size={18} /></span>
          <div className="text-sm leading-relaxed">
            <div className="font-semibold">{error === 'pending' ? 'Research is running for the first time' : 'Research data is unavailable'}</div>
            <p className="mt-1 text-sub">{error === 'pending' ? 'The server analyses the whole market in batches. Picks appear after the first full pass, usually within an hour.' : 'Picks come from the site’s research job on the server. Try again shortly.'}</p>
          </div>
        </div>
      ) : (
        <>
          <RegimeStrip data={data} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented value={h} onChange={setH} options={order.map((k) => ({ value: k, label: `${horizonMeta[k].label} (${of(k).length})` }))} />
            <label className="flex items-center gap-2 text-sm">
              <span className="label">Size</span>
              <select className={clsx('input w-auto py-2', cap !== 'All' && 'border-brand ring-1 ring-brand/30')} value={cap} onChange={(e) => setCap(e.target.value)} aria-label="Filter picks by market cap">
                <option value="All">All sizes</option>
                {caps.map((c) => <option key={c} value={c}>{c} cap ({(data.picks[h] ?? []).filter((p) => p.cap === c).length})</option>)}
              </select>
            </label>
          </div>
          <p className="-mt-2 text-sm text-sub">{horizonMeta[h].blurb}</p>
          {data.building ? (
            <div className="card card-pad text-sm text-sub">
              <span className="font-semibold text-fg">Still building.</span> {data.coverage.history} of {data.universe} stocks have been analysed so far. Picks are held back until at least 70% are in, so the ranking is fair. Check back within the hour.
            </div>
          ) : list.length ? (
            <div className="space-y-4">{list.map((p, i) => <PickCard key={p.symbol} p={p} h={h} market={market} rank={i + 1} quote={quotes[`${market}:${p.symbol}`]} status={status} />)}</div>
          ) : (
            <div className="card card-pad text-sm text-sub">
              <span className="font-semibold text-fg">No {cap === 'All' ? '' : `${cap.toLowerCase()} cap `}{horizonMeta[h].label.toLowerCase()} pick clears the bar today.</span>{cap !== 'All' && <> <button className="font-medium text-brand hover:underline" onClick={() => setCap('All')}>Show all sizes</button>.</>} That is deliberate: a stock needs a top-decile rank, agreement across factors and no red flags. When nothing qualifies, the right trade is no trade.
            </div>
          )}
          <div className="card card-pad">
            <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Info size={16} className="text-brand" /> How picks are made</div>
            <ul className="space-y-3 text-sm leading-relaxed">
              {[
                ['Data', 'public prices (2 years, daily), company financials and analyst estimates. No tips and no inside information: nobody can lawfully know news before it’s public.'],
                ['Scoring', 'each stock is ranked against the whole market on value, quality, growth, momentum, trend, risk and analyst views. Value is compared within the sector.'],
                ['Gates', 'a top-decile score, quality and growth above average for long-term picks, a clean uptrend for short-term picks, and no high debt, losses, extreme volatility or thin trading. In a weak market the bar rises to the top 4–7%.'],
                ['Swing setups', 'breakouts and pullbacks are replayed on each stock’s own history; only setups with a positive record there and across the market qualify, and none are flagged with results due inside the window.'],
                ['Levels', 'entries, stops and targets come from volatility (ATR), moving averages, analyst targets and sector valuation, with at least 1.5× reward for the risk.'],
              ].map(([t, d]) => <li key={t}><span className="font-semibold">{t}</span> — <span className="text-sub">{d}</span></li>)}
            </ul>
            <p className="mt-4 text-xs text-sub">Rule-based research for education, not advice. Past patterns don’t guarantee future results; size positions so a stop-out is affordable.</p>
          </div>
        </>
      )}
    </div>
  );
}
