import { Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import clsx from 'clsx';
import { useChartColors } from '../lib/theme';
import type { AnnualPoint, Market, Quarter, TradeLevels } from '../types';
import { change, fmtPrice, pct } from '../lib/format';

function TooltipBox({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-sub">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span className="num ml-auto pl-3 text-fg">
            {typeof p.value === 'number' ? p.value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : p.value}
            {p.name.includes('%') ? '' : unit ? ` ${unit}` : ''}
          </span>
        </div>
      ))}
    </div>
  );
}

const compact = (v: number) => (Math.abs(v) >= 100000 ? `${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`);

export function QuarterlyChart({ data, unit }: { data: Quarter[]; unit: string }) {
  const c = useChartColors();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="period" tickLine={false} axisLine={false} />
          <YAxis yAxisId="l" tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} tickFormatter={compact} width={44} />
          <Tooltip content={<TooltipBox unit={unit} />} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar yAxisId="l" dataKey="revenue" name="Revenue" fill={c.brand} radius={[6, 6, 0, 0]} maxBarSize={38} />
          <Line yAxisId="r" dataKey="profit" name="Net profit" stroke={c.alt} strokeWidth={2.5} dot={{ r: 3.5, fill: c.alt, strokeWidth: 0 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AnnualChart({ data, unit }: { data: AnnualPoint[]; unit: string }) {
  const c = useChartColors();
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} />
          <YAxis yAxisId="l" tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <YAxis yAxisId="r" orientation="right" tickLine={false} axisLine={false} width={40} />
          <Tooltip content={<TooltipBox unit={unit} />} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar yAxisId="l" dataKey="revenue" name="Revenue" radius={[6, 6, 0, 0]} maxBarSize={42}>
            {data.map((d) => (
              <Cell key={d.year} fill={d.estimate ? c.brandSoft : c.brand} stroke={d.estimate ? c.brand : undefined} strokeDasharray={d.estimate ? '4 3' : undefined} />
            ))}
          </Bar>
          <Line yAxisId="r" dataKey="eps" name="EPS" stroke={c.warn} strokeWidth={2.5} dot={{ r: 3.5, fill: c.warn, strokeWidth: 0 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IpoFinChart({ data }: { data: { year: string; revenue: number; pat: number }[] }) {
  const c = useChartColors();
  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={c.grid} strokeDasharray="3 3" />
          <XAxis dataKey="year" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={48} />
          <Tooltip content={<TooltipBox unit="₹ Cr" />} cursor={{ fill: c.grid, opacity: 0.4 }} />
          <Bar dataKey="revenue" name="Revenue" fill={c.brand} radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Bar dataKey="pat" name="PAT" fill={c.alt} radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MixDonut({ data }: { data: { segment: string; share: number }[] }) {
  const c = useChartColors();
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="h-40 w-40 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="share" nameKey="segment" innerRadius={48} outerRadius={72} paddingAngle={2} stroke={c.surface} strokeWidth={2}>
              {data.map((d, i) => (
                <Cell key={d.segment} fill={c.series[i % c.series.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-2.5">
        {data.map((d, i) => (
          <li key={d.segment} className="flex items-center gap-3 text-sm">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c.series[i % c.series.length] }} />
            <span className="min-w-0 flex-1 truncate">{d.segment}</span>
            <span className="num font-semibold">{d.share}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 52-week range with the current price and fair value marked. */
export function RangeBar({ low, high, price, fair, market }: { low: number; high: number; price: number; fair: number; market: Market }) {
  const lo = Math.min(low, fair, price);
  const hi = Math.max(high, fair, price);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return (
    <div>
      <div className="relative mt-7 h-2 rounded-full bg-muted">
        <div className="absolute h-2 rounded-full bg-gradient-to-r from-down/60 via-warn/60 to-up/60" style={{ left: `${pos(low)}%`, width: `${pos(high) - pos(low)}%` }} />
        <Marker at={pos(price)} label={fmtPrice(price, market)} cls="bg-fg" top />
        <Marker at={pos(fair)} label={`FV ${fmtPrice(fair, market)}`} cls="bg-brand" />
      </div>
      <div className="mt-8 flex justify-between text-xs text-sub">
        <span>52W L <span className="num text-fg">{fmtPrice(low, market)}</span></span>
        <span>52W H <span className="num text-fg">{fmtPrice(high, market)}</span></span>
      </div>
    </div>
  );
}

function Marker({ at, label, cls, top }: { at: number; label: string; cls: string; top?: boolean }) {
  const clampedLeft = Math.max(0, Math.min(100, at));
  return (
    <div className="absolute -translate-x-1/2" style={{ left: `${clampedLeft}%`, top: -4 }}>
      <div className={clsx('h-4 w-1 rounded-full ring-2 ring-surface', cls)} />
      <div className={clsx('absolute whitespace-nowrap text-[0.6875rem] font-semibold num', clampedLeft > 85 ? 'right-0' : clampedLeft < 15 ? 'left-0' : 'left-1/2 -translate-x-1/2', top ? '-top-6' : 'top-5', cls === 'bg-brand' ? 'text-brand' : 'text-fg')}>{label}</div>
    </div>
  );
}

/** Compact price range, e.g. "₹1,440–1,490" or "$440–480" (no decimals on whole numbers). */
function fmtRange(lo: number, hi: number, market: Market) {
  const n = (v: number) => v.toLocaleString(market === 'IN' ? 'en-IN' : 'en-US', { maximumFractionDigits: Number.isInteger(v) ? 0 : 2 });
  return `${market === 'IN' ? '₹' : '$'}${n(lo)}–${n(hi)}`;
}

/** Visual trade plan: stop loss, entry zone, reference price and target on one axis. */
export function TradeLadder({ levels, price, market }: { levels: TradeLevels; price: number; market: Market }) {
  const pts = [levels.stopLoss, levels.target, levels.entry[0], levels.entry[1], price];
  const lo = Math.min(...pts);
  const hi = Math.max(...pts);
  const pad = (hi - lo) * 0.08;
  const pos = (v: number) => ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const bearish = levels.target < price;
  const upside = change(price, levels.target);
  const risk = change(price, levels.stopLoss);
  // A plan whose target sits below its entry zone is an exit (sell into strength) plan.
  const sellPlan = levels.target < levels.entry[0];
  const [lo1, hi1] = levels.entry;
  const mid = (lo1 + hi1) / 2;
  // Reward-to-risk is measured from the planned entry, not from wherever the price is now.
  const rr = Math.abs(levels.target - mid) / Math.max(1e-9, Math.abs(mid - levels.stopLoss));

  let zone: { text: string; tone: string };
  if (sellPlan) {
    if (price >= levels.stopLoss) zone = { text: 'Above stop: thesis invalidated', tone: 'text-down' };
    else if (price >= lo1 && price <= hi1) zone = { text: 'In exit zone now', tone: 'text-up' };
    else if (price < lo1) zone = { text: `${pct(change(price, lo1))} to zone: wait for a bounce`, tone: 'text-warn' };
    else zone = { text: 'Above zone: better exit than planned', tone: 'text-up' };
  } else {
    if (price <= levels.stopLoss) zone = { text: 'Below stop loss: avoid', tone: 'text-down' };
    else if (price >= lo1 && price <= hi1) zone = { text: 'In buy zone now', tone: 'text-up' };
    else if (price > hi1) zone = { text: `${pct(change(hi1, price))} above zone: wait for a dip`, tone: 'text-warn' };
    else zone = { text: 'Below zone: better than planned', tone: 'text-up' };
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-brand/40 bg-brand/5 p-3">
          <div className="label">{sellPlan ? 'Sell / exit at' : 'Buy at'}</div>
          <div className="num mt-1 whitespace-nowrap font-semibold">{fmtRange(lo1, hi1, market)}</div>
          <div className={clsx('text-xs font-medium', zone.tone)}>{zone.text}</div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="label">Target</div>
          <div className="num mt-1 font-semibold">{fmtPrice(levels.target, market)}</div>
          <div className={clsx('num text-xs font-medium', upside >= 0 ? 'text-up' : 'text-down')}>{pct(upside)} from CMP</div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="label">Stop loss</div>
          <div className="num mt-1 font-semibold">{fmtPrice(levels.stopLoss, market)}</div>
          <div className={clsx('num text-xs font-medium', bearish ? 'text-warn' : 'text-down')}>{pct(risk)} from CMP</div>
        </div>
        <div className="rounded-xl bg-muted/60 p-3">
          <div className="label">Reward : Risk</div>
          <div className="num mt-1 font-semibold">{rr.toFixed(1)}x</div>
          <div className="text-xs text-sub">From entry · {levels.horizon}</div>
        </div>
      </div>

      <div className="relative mx-2 mb-2 mt-12 h-2.5 rounded-full bg-muted">
        <div
          className={clsx('absolute h-full rounded-full', bearish ? 'bg-down/25' : 'bg-up/25')}
          style={{ left: `${Math.min(pos(price), pos(levels.target))}%`, width: `${Math.abs(pos(levels.target) - pos(price))}%` }}
        />
        <div
          className={clsx('absolute h-full rounded-full', bearish ? 'bg-warn/30' : 'bg-down/25')}
          style={{ left: `${Math.min(pos(price), pos(levels.stopLoss))}%`, width: `${Math.abs(pos(levels.stopLoss) - pos(price))}%` }}
        />
        <div className="absolute -top-1 h-[18px] rounded-md border border-dashed border-brand/70 bg-brand/10" style={{ left: `${pos(levels.entry[0])}%`, width: `${Math.max(1.5, pos(levels.entry[1]) - pos(levels.entry[0]))}%` }} />
        <Tick at={pos(levels.stopLoss)} label="SL" cls={bearish ? 'bg-warn' : 'bg-down'} />
        <Tick at={pos(levels.target)} label="TGT" cls={bearish ? 'bg-down' : 'bg-up'} />
        <Tick at={pos(price)} label="CMP" cls="bg-fg" above />
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-sub">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-dashed border-brand/70 bg-brand/10" /> {levels.target < levels.entry[0] ? 'Exit' : 'Buy'} zone {fmtRange(levels.entry[0], levels.entry[1], market)}</span>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-sub">{levels.rationale}</p>
    </div>
  );
}

function Tick({ at, label, cls, above }: { at: number; label: string; cls: string; above?: boolean }) {
  return (
    <div className="absolute -translate-x-1/2" style={{ left: `${at}%`, top: -6 }}>
      <div className={clsx('h-[22px] w-1 rounded-full ring-2 ring-surface', cls)} />
      <div className={clsx('absolute left-1/2 -translate-x-1/2 text-[0.625rem] font-bold tracking-wider', above ? '-top-5' : 'top-7')}>{label}</div>
    </div>
  );
}
