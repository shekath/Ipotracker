import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, Info } from 'lucide-react';
import clsx from 'clsx';
import { Badge, CardHead, SegBar } from '../components/ui';
import { fmtRange } from '../components/TradeTicket';
import { timeAgo } from '../components/live';
import { useMarketPref } from '../lib/marketPref';
import { factorLabel, horizonMeta, reasons, risks, useResearch, type Factors, type Horizon, type Pick, type ResearchData } from '../lib/research';
import { change, fmtPrice, pct } from '../lib/format';
import type { Market } from '../types';

const order: Horizon[] = ['st', 'lt', 'sw'];

export function RegimeBanner({ data }: { data: ResearchData }) {
  const r = data.regime;
  const tone = r.state === 'risk-on' ? 'bg-up/10 text-up' : r.state === 'risk-off' ? 'bg-down/10 text-down' : 'bg-warn/10 text-warn';
  return (
    <div className="card flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-[0.8125rem] sm:px-5">
      <span className={clsx('inline-flex items-center gap-2 rounded-md px-2 py-1 font-semibold', tone)}>
        <i className="h-2 w-2 rounded-full bg-current" />
        {r.state === 'unknown' ? 'Regime unknown' : r.state === 'risk-on' ? 'Risk-on market' : r.state === 'risk-off' ? 'Risk-off market' : 'Mixed market'}
      </span>
      <span className="text-fg2">{r.label}. Picks need the top {100 - r.bar}% of the ranking{r.bar > 90 ? ', a higher bar than usual' : ''}.</span>
      <span className="text-sub sm:ml-auto">
        {data.coverage.history} of {data.universe} stocks analysed · updated {timeAgo(data.asOf)}
      </span>
    </div>
  );
}

function FactorBars({ F }: { F: Factors }) {
  return (
    <dl className="grid gap-1.5">
      {(Object.keys(factorLabel) as (keyof Factors)[]).map((k) => (
        <div key={k} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-[0.78125rem]">
          <dt className="text-sub">{factorLabel[k]}</dt>
          <dd>{F[k] != null ? <SegBar score={F[k] as number} /> : <span className="text-sub">no data</span>}</dd>
          <dd className="num text-right font-medium">{F[k] ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

function PickCard({ p, h, market, rank }: { p: Pick; h: Horizon; market: Market; rank: number }) {
  const cur = market === 'IN' ? '₹' : '$';
  const plan = p.plan;
  const mid = (plan.entry[0] + plan.entry[1]) / 2;
  const px = p.price ?? mid;
  const inZone = px >= plan.entry[0] && px <= plan.entry[1];
  const why = reasons(p, h, cur);
  const watch = risks(p, h);
  return (
    <article className="card grid lg:grid-cols-[minmax(0,1fr)_300px_260px]">
      <div className="min-w-0 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="num text-[0.78125rem] text-sub">#{rank}</span>
          <Link to={`/stocks/${market}/${encodeURIComponent(p.symbol)}`} className="tk text-[0.9375rem] hover:text-brand">{p.symbol}</Link>
          <span className="truncate text-sm text-fg2">{p.name}</span>
          {plan.type && <Badge tone="brand">{plan.type}</Badge>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[p.sector, p.cap && `${p.cap} cap`, ...p.idx.slice(0, 2)].filter(Boolean).map((t) => (
            <span key={t as string} className="rounded-md border border-line bg-muted px-2 py-0.5 text-[0.75rem] text-fg2">{t}</span>
          ))}
        </div>
        <div className="label mt-4">WHY IT QUALIFIES</div>
        <ul className="mt-1.5 grid gap-1.5 text-[0.84375rem] leading-relaxed text-fg2">
          {why.map((t) => <li key={t} className="grid grid-cols-[16px_1fr] gap-2"><Check size={15} className="mt-0.5 text-up" />{t}</li>)}
        </ul>
        <div className="label mt-3">WHAT COULD GO WRONG</div>
        <ul className="mt-1.5 grid gap-1.5 text-[0.84375rem] leading-relaxed text-fg2">
          {watch.map((t) => <li key={t} className="grid grid-cols-[16px_1fr] gap-2"><AlertTriangle size={14} className="mt-0.5 text-warn" />{t}</li>)}
        </ul>
      </div>
      <div className="border-t border-line p-4 sm:p-5 lg:border-l lg:border-t-0">
        <div className="rounded-[10px] bg-fg px-4 py-3 text-surface">
          <div className="text-xs font-medium tracking-[0.02em] text-surface/70">BUY AT</div>
          <div className="num text-xl font-semibold tracking-[-0.03em]">{fmtRange(plan.entry[0], plan.entry[1], market)}</div>
          <div className="mt-0.5 text-[0.78125rem] text-surface/80">{inZone ? 'Price is inside the zone' : px > plan.entry[1] ? `${pct(change(plan.entry[1], px))} above the zone: wait for a dip` : 'Below the zone'}</div>
        </div>
        <dl className="mt-2 text-sm">
          {[
            ['Target', plan.target, 'text-up'],
            ...(plan.target2 ? [['Target 2 (3R)', plan.target2, 'text-up'] as const] : []),
            ['Stop loss', plan.stop, 'text-down'],
          ].map(([k, v, c]) => (
            <div key={k as string} className="flex items-baseline justify-between border-b border-dashed border-line py-2 last:border-b-0">
              <dt className="text-fg2">{k}</dt>
              <dd className="text-right">
                <b className={clsx('num font-semibold', c)}>{fmtPrice(v as number, market)}</b>
                <span className="num ml-2 text-xs text-sub">{pct(change(mid, v as number))}</span>
              </dd>
            </div>
          ))}
        </dl>
        <div className="mt-2 flex justify-between text-[0.78125rem] text-sub">
          <span>Reward : risk <b className="num text-fg">{plan.rr.toFixed(1)}×</b></span>
          <span>{plan.horizon}</span>
        </div>
        {plan.pool && (
          <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-[0.75rem] leading-snug text-fg2">
            Across the market, {plan.type?.toLowerCase()} signals in the last 2 years averaged <b className="num text-fg">{plan.pool.avgR >= 0 ? '+' : ''}{plan.pool.avgR.toFixed(2)}R</b> over {plan.pool.n.toLocaleString('en-IN')} trades.
          </p>
        )}
      </div>
      <div className="border-t border-line p-4 sm:p-5 lg:border-l lg:border-t-0">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="label">FACTOR SCORES</span>
          {plan.score != null && <span className="num text-[0.78125rem] text-sub">Rank {plan.score}/100</span>}
        </div>
        <FactorBars F={p.F} />
        <div className="mt-3 text-[0.78125rem] text-sub">
          Last {fmtPrice(px, market)} {p.chg != null && <span className={p.chg >= 0 ? 'text-up' : 'text-down'}>{pct(p.chg, 2)}</span>}
        </div>
      </div>
    </article>
  );
}

export default function Picks() {
  const [market] = useMarketPref();
  const { data, error, loading } = useResearch(market);
  const [h, setH] = useState<Horizon>('st');
  const list = data?.picks[h] ?? [];

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.025em]">High-conviction picks</h1>
          <p className="mt-1 max-w-3xl text-sm text-sub">
            Every {market === 'IN' ? 'Indian stock in the Nifty Total Market' : 'S&P 500 and Nasdaq-100 stock'} is scored daily on fundamentals and technicals. Only the few that clear every gate appear here, with an entry zone, target and stop.
          </p>
        </div>
      </div>

      {loading && !data ? (
        <div className="card h-64 animate-pulse" />
      ) : !data ? (
        <div className="card card-pad flex gap-3 text-sm">
          <Info size={18} className="mt-0.5 shrink-0 text-brand" />
          <div>
            <div className="font-semibold">{error === 'pending' ? 'Research is running for the first time' : 'Research data is unavailable'}</div>
            <p className="mt-1 text-fg2">{error === 'pending' ? 'The server analyses the whole market in batches. Picks appear after the first full pass, usually within an hour.' : 'Picks come from the site’s research job on the server. Try again shortly.'}</p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <RegimeBanner data={data} />
          <div className="card-head card !justify-start !gap-0 !p-0">
            <div className="flex gap-6 px-4 sm:px-5" role="tablist">
              {order.map((k) => (
                <button key={k} role="tab" aria-selected={h === k} onClick={() => setH(k)} className={clsx('relative h-12 whitespace-nowrap text-sm font-medium', h === k ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-fg' : 'text-sub hover:text-fg')}>
                  {horizonMeta[k].label} <span className="num ml-1 text-xs text-sub">{data.picks[k].length}</span>
                </button>
              ))}
            </div>
          </div>
          <p className="-mt-2 text-[0.8125rem] text-sub">{horizonMeta[h].blurb}</p>
          {data.building ? (
            <div className="card card-pad text-sm text-fg2">
              <b className="text-fg">Still building.</b> {data.coverage.history} of {data.universe} stocks have been analysed so far. Picks are held back until at least 70% are in, so the ranking is fair. Check back within the hour.
            </div>
          ) : list.length ? (
            list.map((p, i) => <PickCard key={p.symbol} p={p} h={h} market={market} rank={i + 1} />)
          ) : (
            <div className="card card-pad text-sm text-fg2">
              <b className="text-fg">No {horizonMeta[h].label.toLowerCase()} pick clears the bar today.</b> That is deliberate: a stock needs a top-decile rank, agreement across factors and no red flags. When nothing qualifies, the right trade is no trade.
            </div>
          )}
          <MethodNote />
        </div>
      )}
    </div>
  );
}

function MethodNote() {
  return (
    <div className="card">
      <CardHead title="How picks are made" />
      <ul className="grid gap-2 px-4 py-4 text-[0.84375rem] leading-relaxed text-fg2 sm:px-5">
        <li><b className="text-fg">Data:</b> public prices (2 years, daily), company financials and analyst estimates. No tips, no inside information: nobody can lawfully know news before it’s public.</li>
        <li><b className="text-fg">Scoring:</b> each stock is ranked against the whole market on value, quality, growth, momentum, trend, risk and analyst views. Value is compared within the sector.</li>
        <li><b className="text-fg">Gates:</b> a top-decile horizon score, quality and growth above average for long-term picks, a clean uptrend for short-term picks, no high debt, losses, extreme volatility or thin trading. In a weak market the bar rises to the top 4–7%.</li>
        <li><b className="text-fg">Swing setups:</b> breakouts and pullbacks are replayed on each stock’s own history; only setups with a positive record there and across the market qualify, and none are flagged with results due inside the window.</li>
        <li><b className="text-fg">Levels:</b> entries, stops and targets come from volatility (ATR), moving averages, analyst targets and sector valuation. Every plan needs at least 1.5× reward for the risk.</li>
        <li className="text-sub">Rule-based research for education, not advice. Past patterns don’t guarantee future results; size positions so a stop-out is affordable.</li>
      </ul>
    </div>
  );
}
