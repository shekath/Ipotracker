import { useState } from 'react';
import clsx from 'clsx';
import { change, fmtPrice, pct } from '../lib/format';
import type { Market, TradeLevels } from '../types';

/** Compact price range, e.g. "₹1,440 – 1,490". */
export function fmtRange(lo: number, hi: number, market: Market) {
  const n = (v: number) => v.toLocaleString(market === 'IN' ? 'en-IN' : 'en-US', { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 });
  return `${market === 'IN' ? '₹' : '$'}${n(lo)} – ${n(hi)}`;
}

/** Where today's price sits relative to the plan. */
export function zoneStatus(levels: TradeLevels, price: number) {
  const [lo, hi] = levels.entry;
  // A plan whose target sits below its entry zone is an exit (sell into strength) plan.
  const sell = levels.target < lo;
  if (sell) {
    if (price >= levels.stopLoss) return { text: 'Above the stop: thesis invalidated', tone: 'down' as const, sell };
    if (price >= lo && price <= hi) return { text: 'Price is inside the exit zone', tone: 'up' as const, sell };
    if (price < lo) return { text: `${pct(change(price, lo))} to the zone: wait for a bounce`, tone: 'warn' as const, sell };
    return { text: 'Above the zone: a better exit than planned', tone: 'up' as const, sell };
  }
  if (price <= levels.stopLoss) return { text: 'Below the stop loss: avoid for now', tone: 'down' as const, sell };
  if (price >= lo && price <= hi) return { text: 'Price is inside the buy zone', tone: 'up' as const, sell };
  if (price > hi) return { text: `${pct(change(hi, price))} above the zone: wait for a dip`, tone: 'warn' as const, sell };
  return { text: 'Below the zone: better than planned', tone: 'up' as const, sell };
}

const dot = { up: 'bg-[#3fd18a]', warn: 'bg-[#f5b84a]', down: 'bg-[#ff6b7d]' };

/**
 * Trade plan as a ticket: where to buy, where to exit, reward vs risk, and how
 * many shares to buy for a chosen risk per trade.
 */
export default function TradeTicket({ levels, price, market, fairValue }: { levels: TradeLevels; price: number; market: Market; fairValue: number }) {
  const z = zoneStatus(levels, price);
  const [lo, hi] = levels.entry;
  const mid = (lo + hi) / 2;
  const risk = Math.abs(mid - levels.stopLoss);
  const reward = Math.abs(levels.target - mid);
  const rr = reward / Math.max(1e-9, risk);
  const cur = market === 'IN' ? '₹' : '$';

  const [capInput, setCapInput] = useState(market === 'IN' ? '500000' : '10000');
  const [riskPct, setRiskPct] = useState(1);
  const cap = Number(capInput) || 0;
  const perShare = price - levels.stopLoss;
  const qty = perShare > 0 && price > 0 ? Math.floor(Math.min((cap * riskPct) / 100 / perShare, cap / price)) : 0;
  const money = (v: number) => `${cur}${Math.round(v).toLocaleString(market === 'IN' ? 'en-IN' : 'en-US')}`;

  const row = (k: string, v: number, sub: string, tone: 'up' | 'down' | 'fg') => (
    <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-b border-dashed border-line py-2.5 text-sm last:border-b-0">
      <span className="text-fg2">{k}</span>
      <b className={clsx('num text-[15px] font-semibold', tone === 'up' ? 'text-up' : tone === 'down' ? 'text-down' : 'text-fg')}>{fmtPrice(v, market)}</b>
      <small className="col-span-2 text-xs text-sub">{sub} · <span className="num">{pct(change(price, v))}</span> from now</small>
    </div>
  );

  return (
    <div>
      <div className="rounded-[10px] bg-fg px-4 py-3.5 text-surface">
        <div className="text-xs font-medium tracking-[0.02em] text-surface/70">{z.sell ? 'SELL / EXIT AT' : 'BUY AT'}</div>
        <div className="num mt-0.5 text-[24px] font-semibold leading-tight tracking-[-0.03em]">{fmtRange(lo, hi, market)}</div>
        <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-surface/80"><i className={clsx('h-[7px] w-[7px] rounded-full', dot[z.tone])} />{z.text}</div>
      </div>
      <div className="mt-2">
        {row('Target', levels.target, levels.horizon, z.sell ? 'down' : 'up')}
        {row('Stop loss', levels.stopLoss, z.sell ? 'Exit plan invalidated above' : 'Exit if it closes below', z.sell ? 'up' : 'down')}
        {row('Fair value', fairValue, 'Our 12-month estimate', 'fg')}
      </div>

      <div className="mt-3 text-xs font-medium tracking-[0.02em] text-sub">REWARD VS RISK</div>
      <div className="mt-2 flex h-2 gap-0.5 overflow-hidden rounded-full">
        <i className="bg-down" style={{ flex: risk }} />
        <i className="bg-up" style={{ flex: reward }} />
      </div>
      <div className="num mt-1.5 flex justify-between text-[12.5px]">
        <span className="text-down">Risk {money(risk)}</span>
        <span className="font-semibold">{rr.toFixed(1)}× reward : risk</span>
        <span className="text-up">Reward {money(reward)}</span>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-fg2">{levels.rationale}</p>

      <div className="mt-4 border-t border-line pt-4">
        <div className="text-xs font-medium tracking-[0.02em] text-sub">POSITION SIZE CALCULATOR</div>
        {z.sell ? (
          <p className="mt-2 text-[13px] text-sub">This is an exit plan, so there's no new position to size. Use the zone to trim an existing holding.</p>
        ) : (
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1.5">
              <span className="flex justify-between text-[12.5px] font-medium text-fg2">Capital <span className="text-sub">{cur}</span></span>
              <input
                className="input num font-medium"
                inputMode="numeric"
                value={cap ? cap.toLocaleString(market === 'IN' ? 'en-IN' : 'en-US') : ''}
                onChange={(e) => setCapInput(e.target.value.replace(/[^\d]/g, '').slice(0, 12))}
                aria-label="Capital"
              />
            </label>
            <label className="grid gap-1.5">
              <span className="flex justify-between text-[12.5px] font-medium text-fg2">Risk per trade <span className="num text-fg">{riskPct}%</span></span>
              <input type="range" min={0.25} max={3} step={0.25} value={riskPct} onChange={(e) => setRiskPct(Number(e.target.value))} className="w-full accent-[rgb(var(--fg))]" aria-label="Risk per trade, percent of capital" />
            </label>
            {perShare > 0 ? (
              <dl className="grid grid-cols-3 gap-2">
                {[
                  ['Shares', qty.toLocaleString('en-IN'), ''],
                  ['Invest', money(qty * price), ''],
                  ['Max loss', `−${money(qty * perShare)}`, 'text-down'],
                ].map(([k, v, c]) => (
                  <div key={k} className="rounded-lg bg-muted px-3 py-2.5">
                    <dt className="label">{k}</dt>
                    <dd className={clsx('num mt-0.5 truncate text-[15px] font-semibold', c)}>{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-[13px] text-down">The price is at or below the stop loss, so the plan doesn't support a new position.</p>
            )}
            <p className="text-xs text-sub">Shares are sized so that hitting the stop loses about {riskPct}% of your capital.</p>
          </div>
        )}
      </div>
    </div>
  );
}
