import { useState } from 'react';
import clsx from 'clsx';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check } from 'lucide-react';
import { useChartColors } from '../lib/theme';
import { useHistory, type FeedStatus, type Range } from '../lib/live';
import { fmtDate, fmtPrice, pct } from '../lib/format';
import type { LiveQuote, Market, SubCategory, SubscriptionRow, Timeline } from '../types';
import { Segmented } from './ui';

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

export function ChangeTag({ q, className }: { q?: LiveQuote; className?: string }) {
  if (!q) return null;
  const up = q.changePct >= 0;
  return <span className={clsx('num text-sm font-semibold', up ? 'text-up' : 'text-down', className)}>{up ? '▲' : '▼'} {pct(q.changePct, 2)}</span>;
}

export function PriceChart({ id, market, reference }: { id: string; market: Market; reference?: { label: string; value: number }[] }) {
  const [range, setRange] = useState<Range>('1y');
  const { points, error } = useHistory(id, range);
  const c = useChartColors();
  const data = (points ?? []).map(([t, v]) => ({ t: t * 1000, v }));
  const first = data[0]?.v;
  const last = data[data.length - 1]?.v;
  const ret = first && last ? ((last - first) / first) * 100 : undefined;
  const color = ret == null || ret >= 0 ? c.up : c.down;
  const fmtTick = (t: number) => new Date(t).toLocaleDateString('en-IN', range === '5y' ? { year: '2-digit', month: 'short' } : { day: 'numeric', month: 'short' });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {ret != null ? (
            <span>
              <span className="text-sub">Return ({range.toUpperCase()}): </span>
              <span className={clsx('num font-semibold', ret >= 0 ? 'text-up' : 'text-down')}>{pct(ret)}</span>
            </span>
          ) : (
            <span className="text-sub">Price history</span>
          )}
        </div>
        <Segmented size="sm" value={range} onChange={setRange} options={(['1mo', '6mo', '1y', '5y'] as Range[]).map((r) => ({ value: r, label: r.replace('mo', 'M').toUpperCase() }))} />
      </div>
      <div className="h-64 w-full">
        {error ? (
          <div className="flex h-full items-center justify-center rounded-xl bg-muted/50 px-6 text-center text-sm text-sub">Price history needs the live data API. It works once the site is deployed with PHP (see the README).</div>
        ) : !points ? (
          <div className="h-full animate-pulse rounded-xl bg-muted/60" />
        ) : (
          <ResponsiveContainer>
            <AreaChart data={data} margin={{ top: 8, right: 4, left: -4, bottom: 0 }}>
              <defs>
                <linearGradient id="pc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} scale="time" tickFormatter={fmtTick} tickLine={false} axisLine={false} minTickGap={40} />
              <YAxis domain={['auto', 'auto']} tickLine={false} axisLine={false} width={56} tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${Math.round(v)}`)} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
                      <div className="text-sub">{new Date(payload[0].payload.t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                      <div className="num mt-0.5 font-semibold">{fmtPrice(payload[0].payload.v, market)}</div>
                    </div>
                  ) : null
                }
              />
              <Area dataKey="v" stroke={color} strokeWidth={2} fill="url(#pc)" dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
      {reference && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">{reference.map((r) => <span key={r.label}>{r.label} <span className="num text-fg">{fmtPrice(r.value, market)}</span></span>)}</div>}
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
  const current = steps.findIndex((s) => s.date > today);
  return (
    <div>
      <ol className="grid grid-cols-3 gap-y-5 sm:grid-cols-6">
        {steps.map((s, i) => {
          const done = s.date <= today;
          const next = i === current;
          return (
            <li key={s.label} className="relative flex flex-col items-center text-center">
              {i > 0 && <span className={clsx('absolute right-1/2 top-3.5 hidden h-0.5 w-full sm:block', done ? 'bg-brand' : 'bg-line')} />}
              <span className={clsx('relative z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold', done ? 'border-brand bg-brand text-white' : next ? 'border-brand bg-surface text-brand' : 'border-line bg-surface text-sub')}>
                {done ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span className={clsx('mt-2 text-xs font-medium', next ? 'text-brand' : done ? 'text-fg' : 'text-sub')}>{s.label}</span>
              <span className="num text-xs text-sub">{fmtDate(s.date)}</span>
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
  qib: 'QIB (institutions)',
  nii: 'NII (HNI) total',
  bnii: 'bNII > ₹10 L',
  snii: 'sNII ₹2–10 L',
  retail: 'Retail',
  employee: 'Employees',
  shareholder: 'Shareholders',
  policyholder: 'Policyholders',
  total: 'Total',
};
const order: SubCategory[] = ['qib', 'nii', 'bnii', 'snii', 'retail', 'employee', 'shareholder', 'policyholder', 'total'];

const fx = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)}x`);

export function SubscriptionPanel({ rows }: { rows: SubscriptionRow[] }) {
  const c = useChartColors();
  const cats = order.filter((k) => rows.some((r) => r[k] != null));
  const last = rows[rows.length - 1];
  const chartCats = cats.filter((k) => !['bnii', 'snii'].includes(k));
  const bar = chartCats.map((k) => ({ cat: (subLabels[k] ?? k).replace(' (institutions)', '').replace(' total', ''), v: last[k] ?? 0, key: k }));
  const trendKeys = (['qib', 'nii', 'retail', 'total'] as SubCategory[]).filter((k) => cats.includes(k));
  const colors: Record<string, string> = { qib: c.alt, nii: c.warn, retail: c.brand, total: c.fg };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(['total', 'qib', 'nii', 'retail'] as SubCategory[]).filter((k) => last[k] != null).map((k) => (
          <div key={k} className="rounded-xl bg-muted/60 p-3">
            <div className="label">{subLabels[k]}</div>
            <div className={clsx('num mt-1 text-xl font-bold', (last[k] ?? 0) >= 1 ? 'text-up' : 'text-warn')}>{fx(last[k])}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="label mb-2">By category · latest</div>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={bar} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid horizontal={false} stroke={c.grid} strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={(v) => `${v}x`} />
                <YAxis type="category" dataKey="cat" tickLine={false} axisLine={false} width={86} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.4 }} formatter={(v: number) => [`${v.toFixed(2)}x`, 'Subscribed']} contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, fontSize: 12 }} />
                <Bar dataKey="v" fill={c.brand} radius={[0, 6, 6, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <div className="label mb-2">Day-wise trend</div>
          <div className="h-56">
            {rows.length > 1 ? (
              <ResponsiveContainer>
                <LineChart data={rows.map((r, i) => ({ ...r, day: `Day ${i + 1}` }))} margin={{ right: 8 }}>
                  <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
                  <XAxis dataKey="day" tickLine={false} axisLine={false} />
                  <YAxis tickLine={false} axisLine={false} width={40} tickFormatter={(v) => `${v}x`} />
                  <Tooltip formatter={(v: number, n: string) => [`${v?.toFixed(2)}x`, subLabels[n as SubCategory] ?? n]} contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, fontSize: 12 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} formatter={(v: string) => (subLabels[v as SubCategory] ?? v).replace(' (institutions)', '').replace(' total', '')} />
                  {trendKeys.map((k) => (
                    <Line key={k} dataKey={k} stroke={colors[k]} strokeWidth={k === 'total' ? 3 : 2} dot={{ r: 3 }} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center rounded-xl bg-muted/50 px-6 text-center text-sm text-sub">The trend appears from Day 2 of bidding.</div>
            )}
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="table-base">
          <thead>
            <tr>
              <th>Category</th>
              {rows.map((r, i) => <th key={r.date} className="!text-right">Day {i + 1}<span className="block font-normal normal-case tracking-normal">{fmtDate(r.date)}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {cats.map((k) => (
              <tr key={k} className={clsx(k === 'total' && 'bg-muted/50 font-semibold', ['bnii', 'snii'].includes(k) && 'text-sub')}>
                <td className={clsx(['bnii', 'snii'].includes(k) && 'pl-8')}>{subLabels[k] ?? k}</td>
                {rows.map((r) => <td key={r.date} className="num text-right">{fx(r[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-sub">Times subscribed, excluding the anchor portion. Source: NSE bid data, last updated {timeAgo(last.time)}. QIB = mutual funds, insurers, banks and FPIs; NII = HNIs/corporates; Retail = bids up to ₹2 lakh. When NSE omits the retail multiple, it is derived from retail bids ÷ the retail portion of the issue.</p>
    </div>
  );
}

export function GmpChart({ points, upper }: { points: { date: string; value: number; source: string }[]; upper?: number }) {
  const c = useChartColors();
  const data = points.map((p) => ({ ...p, label: fmtDate(p.date), pct: upper ? (p.value / upper) * 100 : undefined }));
  return (
    <div className="h-52">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: -8 }}>
          <defs>
            <linearGradient id="gmp" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={c.brand} stopOpacity={0.3} />
              <stop offset="100%" stopColor={c.brand} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `₹${v}`} />
          <Tooltip formatter={(v: number, _n, p) => [`₹${v}${p.payload.pct != null ? ` (${p.payload.pct.toFixed(1)}%)` : ''} · ${p.payload.source}`, 'GMP']} contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 12, fontSize: 12 }} />
          <Area dataKey="value" stroke={c.brand} strokeWidth={2.5} fill="url(#gmp)" dot={{ r: 3, fill: c.brand }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
