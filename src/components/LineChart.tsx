import { useEffect, useRef, useState } from 'react';
import type React from 'react';

export type LevelTone = 'up' | 'down' | 'brand' | 'sub';

export interface RefLine {
  value: number;
  label: string;
  tone: LevelTone;
  /** Stretch the y-axis so the line is always visible. */
  inDomain?: boolean;
}

export interface Band {
  from: number;
  to: number;
  label: string;
}

const stroke: Record<LevelTone, string> = { up: 'stroke-up', down: 'stroke-down', brand: 'stroke-brand', sub: 'stroke-sub' };
const fill: Record<LevelTone, string> = { up: 'fill-up', down: 'fill-down', brand: 'fill-brand', sub: 'fill-sub' };

function niceStep(range: number, target = 5) {
  const raw = range / target;
  const mag = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / mag;
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
}

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * Price line with a crosshair, last-value tag, horizontal reference lines and
 * shaded bands (e.g. a buy zone). Colours come from theme classes so it follows
 * light/dark mode.
 */
export default function LineChart({
  points,
  height = 280,
  fmtY,
  fmtX,
  fmtTip,
  refLines = [],
  bands = [],
  overlay,
  xTicks = 5,
  ariaLabel,
}: {
  points: [number, number][];
  height?: number;
  fmtY: (v: number) => string;
  fmtX: (t: number) => string;
  fmtTip: (t: number, v: number) => string;
  refLines?: RefLine[];
  bands?: Band[];
  overlay?: (number | null)[];
  xTicks?: number;
  ariaLabel: string;
}) {
  const [ref, w] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const pad = { l: 0, r: 64, t: 12, b: 26 };
  const vals = points.map((p) => p[1]);
  const extra = [...refLines.filter((r) => r.inDomain).map((r) => r.value), ...bands.flatMap((b) => [b.from, b.to])];
  const lo0 = Math.min(...vals, ...extra);
  const hi0 = Math.max(...vals, ...extra);
  const step = niceStep(hi0 - lo0 || hi0 * 0.02 || 1);
  const lo = Math.floor(lo0 / step) * step;
  const hi = Math.ceil(hi0 / step) * step;
  const iw = Math.max(1, w - pad.l - pad.r);
  const X = (i: number) => pad.l + (i / Math.max(1, points.length - 1)) * iw;
  const Y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo || 1)) * (height - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
  const last = vals[vals.length - 1];
  const grid: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) grid.push(v);
  const ticks = Array.from({ length: xTicks }, (_, k) => Math.round(((k + 0.5) / xTicks) * (points.length - 1)));
  const inView = (v: number) => v >= lo && v <= hi;
  const gid = useRef('lc' + Math.random().toString(36).slice(2, 8)).current;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {w > 0 && points.length > 1 && (
        <svg width={w} height={height} className="block cursor-crosshair touch-pan-y" role="img" aria-label={ariaLabel} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="[stop-color:rgb(var(--fg))]" stopOpacity="0.1" />
              <stop offset="1" className="[stop-color:rgb(var(--fg))]" stopOpacity="0" />
            </linearGradient>
          </defs>
          {grid.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(v)} y2={Y(v)} className="stroke-line" />
              {Math.abs(Y(v) - Y(last)) > 14 && <text x={w - pad.r + 10} y={Y(v) + 4} className="fill-sub font-mono text-[11px]">{fmtY(v)}</text>}
            </g>
          ))}
          {bands.map((b) => (
            <g key={b.label}>
              <rect x={pad.l} width={iw} y={Y(Math.max(b.from, b.to))} height={Math.abs(Y(b.from) - Y(b.to))} className="fill-brand" fillOpacity={0.1} />
              <line x1={pad.l} x2={w - pad.r} y1={Y(b.to)} y2={Y(b.to)} className="stroke-brand" strokeOpacity={0.5} />
              <line x1={pad.l} x2={w - pad.r} y1={Y(b.from)} y2={Y(b.from)} className="stroke-brand" strokeOpacity={0.5} />
              <text x={w - pad.r - 8} y={Y(Math.min(b.from, b.to)) - 6} textAnchor="end" className="fill-brand font-mono text-[11px] font-semibold">{b.label}</text>
            </g>
          ))}
          {overlay && (
            <path d={overlay.map((v, i) => (v == null ? '' : `${i && overlay[i - 1] != null ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`)).join('')} fill="none" className="stroke-sub" strokeWidth={1.25} strokeDasharray="1 3" strokeLinecap="round" />
          )}
          <path d={`${path}L${X(points.length - 1)},${height - pad.b}L${X(0)},${height - pad.b}Z`} fill={`url(#${gid})`} />
          <path d={path} fill="none" className="stroke-fg" strokeWidth={1.75} strokeLinejoin="round" />
          {refLines.filter((r) => inView(r.value)).map((r) => (
            <g key={r.label}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(r.value)} y2={Y(r.value)} className={stroke[r.tone]} strokeWidth={1.25} strokeDasharray="6 4" />
              <rect x={pad.l + 4} y={Y(r.value) - 19} width={r.label.length * 6.8 + 14} height={17} rx={4} className={`fill-surface ${stroke[r.tone]}`} />
              <text x={pad.l + 11} y={Y(r.value) - 7} className={`${fill[r.tone]} font-mono text-[11px] font-semibold`}>{r.label}</text>
            </g>
          ))}
          <rect x={w - pad.r + 4} y={Y(last) - 10} width={pad.r - 6} height={20} rx={4} className="fill-fg" />
          <text x={w - pad.r + 9} y={Y(last) + 4} className="fill-surface font-mono text-[11px] font-semibold">{fmtY(last)}</text>
          {ticks.map((i) => (
            <text key={i} x={X(i)} y={height - 8} textAnchor="middle" className="fill-sub font-mono text-[11px]">{fmtX(points[i][0])}</text>
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} className="stroke-fg2" strokeDasharray="2 3" />
              <line x1={pad.l} x2={w - pad.r} y1={Y(vals[hover])} y2={Y(vals[hover])} className="stroke-fg2" strokeDasharray="2 3" />
              <circle cx={X(hover)} cy={Y(vals[hover])} r={4.5} className="fill-fg stroke-surface" strokeWidth={2} />
            </g>
          )}
        </svg>
      )}
      {hover != null && (
        <div
          className="pointer-events-none absolute whitespace-nowrap rounded-md bg-fg px-2.5 py-1.5 font-mono text-xs font-medium text-surface"
          style={{ left: Math.min(Math.max(X(hover), 70), w - 140), top: Y(vals[hover]), transform: 'translate(-50%, calc(-100% - 12px))' }}
        >
          {fmtTip(points[hover][0], vals[hover])}
        </div>
      )}
    </div>
  );
}
