import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useHistory, type FeedStatus, type Range } from '../lib/live';
import { fmtDate, fmtPrice, pct } from '../lib/format';
import type { LiveQuote, Market, SubCategory, SubscriptionRow, Timeline } from '../types';
import { Segmented } from './ui';
import LineChart, { type Band, type RefLine } from './LineChart';

export function timeAgo(ts: number) {
  const s = Math.max(0, Math.round(Date.now() / 1000 - ts));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

/** Small "Live / Market closed / Snapshot" indicator. */
export function LiveDot({ status, quote, className }: { status: FeedStatus; quote?: LiveQuote; className?: string }) {
  let label = 'Snapshot';
  let cls = 'bg-sub/60';
  let pulse = false;
  if (quote) {
    if (quote.stale) {
      label = 'Delayed';
      cls = 'bg-warn';
    } else if (quote.marketOpen) {
      label = 'Live';
      cls = 'bg-up';
      pulse = true;
    } else {
      label = 'Market closed';
      cls = 'bg-sub';
    }
  } else if (status === 'loading') {
    label = 'Connecting…';
  }
  return (
    <span className={clsx('inline-flex items-center gap-1.5 text-xs font-medium text-sub', className)} title={quote ? `${quote.source} · updated ${timeAgo(quote.time)}` : 'Research snapshot price — live feed unavailable'}>
      <span className="relative flex h-2 w-2">
        {pulse && <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', cls)} />}
        <span className={clsx('relative inline-flex h-2 w-2 rounded-full', cls)} />
      </span>
      {label}
    </span>
  );
}

export function ChangeTag({ q, className, abs }: { q?: LiveQuote; className?: string; abs?: boolean }) {
  if (!q) return null;
  const up = q.changePct >= 0;
  return (
    <span className={clsx('num whitespace-nowrap text-sm font-semibold', up ? 'text-up' : 'text-down', className)}>
      {up ? '▲' : '▼'} {abs && `${Math.abs(q.change).toLocaleString('en-IN', { maximumFractionDigits: 2 })} (`}{pct(q.changePct, 2)}{abs && ')'}
    </span>
  );
}

const rangeLabel = (r: Range) => r.replace('mo', 'M').toUpperCase();

export interface ChartLevels {
  zone?: [number, number];
  zoneLabel?: string;
  target?: number;
  stop?: number;
  fair?: number;
}

type Toggle = 'zone' | 'target' | 'stop' | 'fair' | 'ma';
const toggleMeta: Record<Toggle, { label: string; sw: string }> = {
  zone: { label: 'Buy zone', sw: 'bg-brand border-brand' },
  target: { label: 'Target', sw: 'bg-up border-up' },
  stop: { label: 'Stop loss', sw: 'bg-down border-down' },
  fair: { label: 'Fair value', sw: 'bg-fg2 border-fg2' },
  ma: { label: '50-day avg', sw: 'bg-sub border-sub' },
};

/**
 * Price history with optional trade levels drawn on the chart. Levels can be
 * switched on and off; `prevClose` draws the previous close on intraday charts.
 */
export function PriceChart({
  id,
  market,
  levels,
  height = 300,
  ranges = ['1mo', '6mo', '1y', '5y'],
  initialRange = '1y',
  prevClose,
  compact,
  name = 'Price',
}: {
  id: string;
  market: Market;
  levels?: ChartLevels;
  height?: number;
  ranges?: Range[];
  initialRange?: Range;
  prevClose?: number;
  compact?: boolean;
  /** What the chart shows, for its screen-reader summary, e.g. "Reliance Industries". */
  name?: string;
}) {
  const [range, setRange] = useState<Range>(initialRange);
  const [on, setOn] = useState<Record<Toggle, boolean>>({ zone: true, target: true, stop: true, fair: false, ma: false });
  const { points, error } = useHistory(id, range);
  const pts = points ?? [];
  const first = pts[0]?.[1];
  const last = pts[pts.length - 1]?.[1];
  const ret = range !== '1d' && first && last ? ((last - first) / first) * 100 : undefined;
  const intraday = range === '1d';
  const nf = (v: number, d = 0) => v.toLocaleString(market === 'IN' ? 'en-IN' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

  const ma = useMemo(() => {
    if (!on.ma || pts.length < 60 || range === '5y' || intraday) return undefined;
    let sum = 0;
    return pts.map((p, i) => {
      sum += p[1];
      if (i >= 50) sum -= pts[i - 50][1];
      return i >= 49 ? sum / 50 : null;
    });
  }, [on.ma, pts, range, intraday]);

  const available = (Object.keys(toggleMeta) as Toggle[]).filter((k) => (k === 'zone' ? levels?.zone : k === 'ma' ? !intraday && range !== '5y' : levels?.[k as 'target' | 'stop' | 'fair'] != null));
  const refLines: RefLine[] = [];
  const bands: Band[] = [];
  if (levels) {
    const t = (v: number) => nf(v, v < 100 ? 2 : 0);
    if (on.zone && levels.zone) bands.push({ from: levels.zone[0], to: levels.zone[1], label: levels.zoneLabel ?? 'BUY ZONE' });
    if (on.target && levels.target != null) refLines.push({ value: levels.target, label: `TGT ${t(levels.target)}`, tone: 'up', inDomain: true });
    if (on.stop && levels.stop != null) refLines.push({ value: levels.stop, label: `SL ${t(levels.stop)}`, tone: 'down', inDomain: true });
    if (on.fair && levels.fair != null) refLines.push({ value: levels.fair, label: `FV ${t(levels.fair)}`, tone: 'sub', inDomain: true });
  }
  if (prevClose != null && intraday) refLines.push({ value: prevClose, label: `Prev close ${nf(prevClose)}`, tone: 'sub', inDomain: true });

  // One-line message for screen readers: direction, latest value and where it sits against the plan.
  const summary = (() => {
    if (!last) return `${name} chart`;
    const move = intraday ? (prevClose ? pct(((last - prevClose) / prevClose) * 100, 2) + ' today' : 'today') : ret != null ? `${pct(ret)} over ${rangeLabel(range)}` : rangeLabel(range);
    let where = '';
    if (levels?.zone) where = last < Math.min(...levels.zone) ? ', below the buy zone' : last > Math.max(...levels.zone) ? ', above the buy zone' : ', inside the buy zone';
    return `${name} chart, ${move}, latest ${fmtPrice(last, market)}${where}`;
  })();

  const fmtX = (t: number) => {
    const d = new Date(t * 1000);
    if (intraday) return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: market === 'IN' ? 'Asia/Kolkata' : 'America/New_York' });
    return d.toLocaleDateString('en-IN', range === '5y' ? { month: 'short', year: '2-digit' } : range === '1mo' ? { day: 'numeric', month: 'short' } : { month: 'short' });
  };
  const fmtTip = (t: number, v: number) => `${intraday ? fmtX(t) : new Date(t * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}  ${fmtPrice(v, market)}`;

  return (
    <div>
      <div className={clsx('flex flex-wrap items-center justify-between gap-3', compact ? 'mb-2' : 'mb-3')}>
        {levels && available.length ? (
          <div className="flex flex-wrap gap-2 sm:gap-1.5">
            {available.map((k) => (
              <button key={k} aria-pressed={on[k]} onClick={() => setOn((o) => ({ ...o, [k]: !o[k] }))} className={clsx('inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-[0.8125rem] font-medium transition-colors sm:h-7', on[k] ? 'border-line2 text-fg' : 'border-line text-sub hover:text-fg')}>
                <i className={clsx('h-2.5 w-2.5 rounded-[3px] border-[1.5px]', on[k] ? toggleMeta[k].sw : 'border-current')} />
                {toggleMeta[k].label}
              </button>
            ))}
          </div>
        ) : (
          <div className="text-sm">
            {ret != null ? (
              <span><span className="text-sub">Return ({rangeLabel(range)}) </span><span className={clsx('num font-semibold', ret >= 0 ? 'text-up' : 'text-down')}>{pct(ret)}</span></span>
            ) : (
              <span className="text-sub">{intraday ? 'Today, 5-minute bars' : 'Price history'}</span>
            )}
          </div>
        )}
        <Segmented size="sm" value={range} onChange={setRange} options={ranges.map((r) => ({ value: r, label: rangeLabel(r) }))} />
      </div>
      <div style={{ height }}>
        {error ? (
          <div className="flex h-full items-center justify-center rounded-lg bg-muted px-6 text-center text-sm text-sub">Price history needs the live data API. It works once the site is deployed with PHP.</div>
        ) : !points ? (
          <div className="h-full animate-pulse rounded-lg bg-muted" />
        ) : pts.length < 2 ? (
          <div className="flex h-full items-center justify-center rounded-lg bg-muted px-6 text-center text-sm text-sub">{intraday ? 'No trades yet today. The chart fills in once the market opens.' : 'Not enough history for this range.'}</div>
        ) : (
          <LineChart
            points={pts}
            height={height}
            fmtY={(v) => (v >= 10000 ? nf(v) : v >= 100 ? nf(v) : nf(v, 2))}
            fmtX={fmtX}
            fmtTip={fmtTip}
            refLines={refLines}
            bands={bands}
            overlay={ma}
            ariaLabel={summary}
          />
        )}
      </div>
      {levels && ret != null && (
        <div className="mt-2 text-xs text-sub">Return ({rangeLabel(range)}) <span className={clsx('num font-semibold', ret >= 0 ? 'text-up' : 'text-down')}>{pct(ret)}</span></div>
      )}
    </div>
  );
}

// ---------------- IPO timeline ----------------

export function TimelineSteps({ t }: { t: Timeline }) {
  const today = new Date().toISOString().slice(0, 10);
  const steps = [
    { label: 'Opens', date: t.open },
    { label: 'Closes', date: t.close },
    { label: 'Allotment', date: t.allotment },
    { label: 'Refunds', date: t.refund },
    { label: 'Demat credit', date: t.demat },
    { label: 'Listing', date: t.listing },
  ].filter((s): s is { label: string; date: string } => !!s.date);
  const current = steps.findIndex((s) => s.date >= today);
  const dayName = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div>
      <ol className="grid grid-cols-3 gap-y-5 sm:grid-cols-6">
        {steps.map((s, i) => {
          const done = current === -1 || i < current;
          const now = i === current;
          return (
            <li key={s.label} className="relative pt-6 pr-2 text-[0.8125rem]">
              <span className={clsx('absolute left-0 right-0 top-[5px] h-0.5', done ? 'bg-fg' : now ? 'bg-gradient-to-r from-fg from-50% to-line to-50%' : 'bg-line')} />
              <span className={clsx('absolute left-0 top-0 h-3 w-3 rounded-full border-2', done ? 'border-fg bg-fg' : now ? 'border-brand bg-brand ring-4 ring-brand/15' : 'border-line2 bg-surface')} />
              <b className={clsx('block text-[0.84375rem] font-semibold', !done && !now && 'text-fg2')}>{s.label}</b>
              <span className="text-sub">{dayName(s.date)}</span>
            </li>
          );
        })}
      </ol>
      {t.estimated && <p className="mt-4 text-xs text-sub">Dates after close are estimated with SEBI’s T+3 listing timetable (working days); the exchange notice is final.</p>}
    </div>
  );
}

// ---------------- Subscription ----------------

export const subLabels: Partial<Record<SubCategory, string>> = {
  qib: 'QIB · institutions',
  nii: 'NII · HNIs, total',
  bnii: 'NII above ₹10 L',
  snii: 'NII ₹2–10 L',
  retail: 'Retail · up to ₹2 L',
  employee: 'Employees',
  shareholder: 'Shareholders',
  policyholder: 'Policyholders',
  total: 'Total',
};
const order: SubCategory[] = ['qib', 'nii', 'bnii', 'snii', 'retail', 'employee', 'shareholder', 'policyholder', 'total'];

const fx = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)}×`);

/**
 * Background tint for a subscription multiple (log scale, 60× = darkest).
 * The tint stops at 45% so the dark text stays above 8:1 in both themes.
 */
function heat(v: number | null | undefined) {
  if (v == null) return {};
  const a = Math.min(1, Math.log10(v + 1) / Math.log10(61));
  return { background: `color-mix(in srgb, rgb(var(--brand)) ${Math.round(a * 45)}%, rgb(var(--surface)))`, color: 'rgb(var(--fg))' };
}

export function SubscriptionPanel({ rows, closeDate }: { rows: SubscriptionRow[]; closeDate?: string | null }) {
  const cats = order.filter((k) => rows.some((r) => r[k] != null));
  const last = rows[rows.length - 1];
  const total = last.total;
  return (
    <div>
      <div className="px-4 pb-4 pt-1 sm:px-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="num text-4xl font-semibold tracking-[-0.04em]">{fx(total)}</span>
          <span className="text-fg2">overall · Day {rows.length}{closeDate ? ` · closes ${fmtDate(closeDate)}` : ''}</span>
        </div>
        <p className="mt-1.5 text-[0.8125rem] text-sub">
          {total != null && total >= 1 ? `Bids are ${total.toFixed(1)} times the shares on offer.` : 'The issue is not fully subscribed yet.'} When the retail category is heavily oversubscribed, allotment works like a lottery: one lot per winning applicant.
        </p>
      </div>
      <div className="overflow-x-auto border-t border-line">
        <table className="table-base">
          <thead>
            <tr>
              <th>Category</th>
              {rows.map((r, i) => <th key={r.date} className="!text-right">Day {i + 1}<span className="ml-1 font-normal">· {fmtDate(r.date)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {cats.map((k) => (
              <tr key={k} className={clsx(k === 'total' && 'font-semibold')}>
                <td className={clsx(['bnii', 'snii'].includes(k) && 'pl-8 text-sub')}>{subLabels[k] ?? k}</td>
                {rows.map((r) => (
                  <td key={r.date} className="text-right">
                    <span className="num inline-block min-w-[4.25rem] rounded-md px-2 py-1 text-right text-[0.8125rem] font-medium" style={heat(r[k])}>{fx(r[k])}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-line px-4 py-3 text-xs text-sub sm:px-5">Times subscribed, excluding the anchor portion. Source: NSE bid data, updated {timeAgo(last.time)}. QIB = mutual funds, insurers, banks and FPIs; NII = HNIs and corporates; Retail = bids up to ₹2 lakh.</p>
    </div>
  );
}

/** Daily GMP as bars, latest highlighted. */
export function GmpChart({ points, upper }: { points: { date: string; value: number; source: string }[]; upper?: number }) {
  const data = points.slice(-8);
  const max = Math.max(...data.map((p) => p.value), 1);
  const min = Math.min(...data.map((p) => p.value), 0);
  const span = max - min || 1;
  return (
    <div className="flex h-44 items-end gap-2 pt-6" role="img" aria-label="Grey market premium by day">
      {data.map((p, i) => {
        const h = ((p.value - min) / span) * 100;
        const lastBar = i === data.length - 1;
        return (
          <div key={p.date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`₹${p.value}${upper ? ` (${((p.value / upper) * 100).toFixed(1)}%)` : ''} · ${p.source}`}>
            <span className="num text-[0.71875rem] font-semibold">{p.value}</span>
            <div className={clsx('w-full max-w-[28px] rounded-[3px]', p.value < 0 ? 'bg-down' : lastBar ? 'bg-up' : 'bg-up/35')} style={{ height: `${Math.max(3, h)}%` }} />
            <span className="num truncate text-[0.6875rem] text-sub">{lastBar ? 'Latest' : fmtDate(p.date)}</span>
          </div>
        );
      })}
    </div>
  );
}
