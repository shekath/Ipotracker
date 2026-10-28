import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type KeyboardEvent as RKeyboardEvent } from 'react';
import clsx from 'clsx';
import { RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { getJSON } from '../lib/api';
import { Badge, Segmented } from '../components/ui';
import {
  INDEX_KEYS, INDEX_NAMES, baseValue, computeRange, defaultPrice, levels, signal,
  type Base, type Divisor, type IndexKey, type Level, type PrevWeek, type Signal, type WeeklyFeed, type WeeklyResult, type WeekSoFar,
} from '../lib/weeklyTargets';

const BASE_WORD: Record<Base, string> = { avg: 'average', high: 'high', low: 'low', close: 'close' };
const STEP_LABEL: Record<Divisor, string> = { 4: 'Range ÷ 4', 2: 'Range ÷ 2', 1: 'Full range' };
const C = { up: 'rgb(var(--up))', down: 'rgb(var(--down))', pivot: 'rgb(var(--warn))', fg: 'rgb(var(--fg))', sub: 'rgb(var(--sub))', surface: 'rgb(var(--surface))', line: 'rgb(var(--line))', brand: 'rgb(var(--brand))' };

type Inputs = PrevWeek & { price: number; wkHigh: number; wkLow: number };
type Edits = Partial<Record<keyof Inputs, number>>;

const fmt = (n: number, dp = 2) => (Number.isFinite(n) ? n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp }) : '—');
const sgn = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const toNum = (s: string) => { const t = s.replace(/,/g, '').trim(); return t === '' ? NaN : Number(t); };

function store<T>(key: string, fallback: T, ok: (v: unknown) => boolean): T {
  try { const v = JSON.parse(localStorage.getItem(key) ?? 'null'); return ok(v) ? (v as T) : fallback; } catch { return fallback; }
}
function save(key: string, v: unknown) { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* storage unavailable */ } }

async function loadFeed(): Promise<{ feed: WeeklyFeed; live: boolean }> {
  try {
    const j = await getJSON<{ indices: WeeklyFeed }>('weekly.php');
    if (j.indices?.NIFTY?.prev) return { feed: j.indices, live: true };
    throw new Error('empty');
  } catch {
    const res = await fetch('./data/weekly-snapshot.json');
    const j = (await res.json()) as { indices: WeeklyFeed };
    return { feed: j.indices, live: false };
  }
}

export default function WeeklyTargets() {
  const [index, setIndex] = useState<IndexKey>(() => store('ml-wt-index', 'NIFTY' as IndexKey, (v) => INDEX_KEYS.includes(v as IndexKey)));
  const [div, setDiv] = useState<Divisor>(() => store('ml-wt-div', 4 as Divisor, (v) => v === 1 || v === 2 || v === 4));
  const [feed, setFeed] = useState<WeeklyFeed | null>(null);
  const [live, setLive] = useState(false);
  const [failed, setFailed] = useState(false);
  const [edits, setEdits] = useState<Partial<Record<IndexKey, Edits>>>({});
  const [panel, setPanel] = useState(false);
  const [hl, setHl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const run = () => loadFeed().then((r) => { if (alive) { setFeed(r.feed); setLive(r.live); setFailed(false); } }).catch(() => alive && setFailed(true));
    run();
    const t = setInterval(() => { if (live) run(); }, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [live]);

  useEffect(() => save('ml-wt-index', index), [index]);
  useEffect(() => save('ml-wt-div', div), [div]);

  const item = feed?.[index];
  const loaded: Partial<Inputs> = item
    ? { ...item.prev, price: defaultPrice(item), wkHigh: item.current?.high ?? NaN, wkLow: item.current?.low ?? NaN }
    : {};
  const v = { ...loaded, ...(edits[index] ?? {}) } as Inputs;
  const def = defaultPrice(item);
  const setField = (f: keyof Inputs, n: number) => setEdits((e) => ({ ...e, [index]: { ...(e[index] ?? {}), [f]: n } }));
  const resetPrice = () => setEdits((e) => { const cur = { ...(e[index] ?? {}) }; delete cur.price; return { ...e, [index]: cur }; });
  const resetAll = () => setEdits((e) => ({ ...e, [index]: {} }));

  const calc = useMemo(() => {
    if (!item) return null;
    try {
      const r = computeRange(v);
      const week: WeekSoFar | null = Number.isFinite(v.wkHigh) || Number.isFinite(v.wkLow)
        ? { high: Math.max(Number.isFinite(v.wkHigh) ? v.wkHigh : v.price, v.price), low: Math.min(Number.isFinite(v.wkLow) ? v.wkLow : v.price, v.price) }
        : null;
      const s = Number.isFinite(v.price) ? signal(r, v.price, div, week) : null;
      return { r, s, week, step: r.range / div, err: null as string | null };
    } catch (e) {
      return { r: null, s: null, week: null, step: NaN, err: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, JSON.stringify(v), div]);

  const setPrice = useCallback((p: number) => setField('price', Math.round(p * 100) / 100), // eslint-disable-next-line react-hooks/exhaustive-deps
    [index]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Weekly index targets</h1>
          <p className="mt-1 text-sm text-sub">
            Last week's high, low, close and India VIX set this week's levels for Nifty, Bank Nifty and Sensex.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented value={index} onChange={(k) => { setIndex(k); setHl(null); }} options={INDEX_KEYS.map((k) => ({ value: k, label: k === 'NIFTY' ? 'Nifty' : k === 'BANKNIFTY' ? 'Bank Nifty' : 'Sensex' }))} />
          <button className="btn border border-line bg-surface text-fg hover:bg-muted" onClick={() => setPanel(true)}>
            <SlidersHorizontal size={15} /> Edit inputs
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-sub">
        {item ? (
          <>
            <Badge tone={live && !item.stale ? 'up' : 'warn'}>{live ? (item.stale ? 'Live · delayed' : 'Live') : 'Snapshot'}</Badge>
            <span>Last week {item.prevWeekLabel} · {live ? item.source : 'research snapshot (live feed unavailable)'}</span>
          </>
        ) : failed ? <span className="text-down">Couldn't load index data. Open Edit inputs to type last week's numbers.</span> : <span>Loading index data…</span>}
      </div>

      {!item && !failed && <div className="card card-pad h-48 animate-pulse" />}

      {calc?.err && (
        <div className="card card-pad text-sm text-down">{calc.err}. Open <b>Edit inputs</b> and fill in last week's numbers.</div>
      )}

      {calc?.r && (
        <>
          <Hero name={INDEX_NAMES[index]} r={calc.r} s={calc.s} price={v.price} def={def} weekLabel={item?.prevWeekLabel ?? ''} livePrice={live ? item?.current?.price : undefined} onPrice={setPrice} onReset={resetPrice} />

          <section className="card card-pad">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Where price sits this week</h2>
              <Segmented size="sm" value={String(div) as '4' | '2' | '1'} onChange={(d) => setDiv(Number(d) as Divisor)} options={[{ value: '4', label: 'Range ÷ 4' }, { value: '2', label: '÷ 2' }, { value: '1', label: 'Full' }]} />
            </div>
            <Rail r={calc.r} s={calc.s} div={div} price={v.price} week={calc.week} hl={hl} setHl={setHl} onPrice={setPrice} step={calc.step} />
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-sub">
              <Legend color="bg-up" text="Upside target" />
              <Legend color="bg-down" text="Downside target" />
              <Legend color="bg-warn" text="Pivot (last week's average)" />
              <Legend color="bg-sub" text="Last week's high / low / close" />
              <span>Drag the handle or use ← → to try a price</span>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            {(['up', 'down'] as const).map((side) => (
              <TargetList key={side} side={side} r={calc.r!} s={calc.s} div={div} step={calc.step} price={v.price} hl={hl} setHl={setHl} />
            ))}
          </div>

          <details className="card card-pad group">
            <summary className="flex cursor-pointer list-none items-center justify-between font-semibold">
              How the levels are calculated
              <span className="text-xl leading-none text-sub group-open:hidden">+</span>
              <span className="hidden text-xl leading-none text-sub group-open:inline">−</span>
            </summary>
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Fx name="Average" f={`(${fmt(calc.r.inputs.high)} + ${fmt(calc.r.inputs.low)}) ÷ 2`} v={fmt(calc.r.avg)} />
              <Fx name="India VIX average" f={`(${calc.r.inputs.vixHigh} + ${calc.r.inputs.vixLow}) ÷ 2`} v={fmt(calc.r.vixAvg, 4)} />
              <Fx name="Range" f="(Avg × VIX% + Avg) ÷ VIX avg" v={fmt(calc.r.range)} hot />
              <Fx name="Step" f={`Range ÷ ${div}`} v={fmt(calc.step)} hot />
            </div>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-sub">
              Each target is one of last week's levels (average, high, low or close) plus or minus the step. <b className="text-fg">Above the pivot</b>, watch the upside targets; <b className="text-fg">below it</b>, the downside targets. Range ÷ 4 is the primary step; ÷ 2 and the full range give wider levels.
            </p>
          </details>
        </>
      )}

      <p className="text-xs text-sub">Rule-based levels from a VIX-range model, not a forecast or investment advice.</p>

      {panel && (
        <InputsPanel
          title={`${INDEX_NAMES[index]}${item ? ' · last week ' + item.prevWeekLabel : ''}`}
          v={v} err={calc?.err ?? null} onField={setField} onReset={resetAll} onClose={() => setPanel(false)}
        />
      )}
    </div>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return <span className="inline-flex items-center gap-1.5"><span className={clsx('h-2.5 w-2.5 rounded-full', color)} />{text}</span>;
}

function Fx({ name, f, v, hot }: { name: string; f: string; v: string; hot?: boolean }) {
  return (
    <div className={clsx('min-w-0 rounded-xl p-3.5', hot ? 'bg-warn/10' : 'bg-muted')}>
      <div className="label">{name}</div>
      <div className="mt-1 break-words font-mono text-[11px] text-sub">{f}</div>
      <div className={clsx('num mt-0.5 text-lg font-semibold', hot && 'text-warn')}>{v}</div>
    </div>
  );
}

// ---------- Hero ----------
function Hero({ name, r, s, price, def, weekLabel, livePrice, onPrice, onReset }: {
  name: string; r: WeeklyResult; s: Signal | null; price: number; def: number; weekLabel: string; livePrice?: number;
  onPrice: (p: number) => void; onReset: () => void;
}) {
  const [text, setText] = useState<string | null>(null);
  const isDef = Number.isFinite(def) && Math.abs(price - def) < 0.005;
  const up = s?.bias === 'bullish', dn = s?.bias === 'bearish';
  const nt = s?.nextTarget ?? null;
  const span = nt ? Math.abs(nt.price - r.avg) : 0;
  const done = nt && span ? clamp(1 - Math.abs(nt.distance) / span, 0, 1) : 0;
  const ring = 2 * Math.PI * 34;
  return (
    <section className="card grid overflow-hidden lg:grid-cols-[1fr_1.3fr_1fr]" aria-label="This week at a glance">
      <div className="grid content-start gap-2 p-5 sm:p-6">
        <span className="label">{name} · current price</span>
        <input
          aria-label="Current price"
          inputMode="decimal"
          className="num w-full border-0 border-b-2 border-line bg-transparent pb-1 text-[2.1rem] font-semibold tracking-tight outline-none focus:border-brand"
          value={text ?? fmt(price)}
          onFocus={() => setText(Number.isFinite(price) ? String(price) : '')}
          onChange={(e) => { setText(e.target.value); const n = toNum(e.target.value); if (Number.isFinite(n)) onPrice(n); }}
          onBlur={() => setText(null)}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <div className="flex flex-wrap gap-2">
          <button className="chip" disabled={isDef || !Number.isFinite(def)} onClick={onReset} style={isDef ? { opacity: 0.5, cursor: 'default' } : undefined}>
            <RotateCcw size={13} /> Reset to weekly close {fmt(def)}
          </button>
          {livePrice !== undefined && Number.isFinite(livePrice) && Math.abs(price - livePrice) >= 0.005 && (
            <button className="chip" onClick={() => onPrice(livePrice)}>Use live price {fmt(livePrice)}</button>
          )}
        </div>
        <span className="text-xs text-sub">
          {isDef
            ? `Default: last week's close${weekLabel ? ` (${weekLabel})` : ''}. Type or drag to try another price.`
            : "Your what-if price. Reset to go back to last week's close."}
        </span>
      </div>

      <div className={clsx('grid content-start gap-2 border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0', up ? 'bg-up/10' : dn ? 'bg-down/10' : 'bg-muted')} aria-live="polite">
        {s ? (
          <>
            <span className={clsx('justify-self-start rounded-full bg-surface px-2.5 py-1 text-xs font-bold', up ? 'text-up' : dn ? 'text-down' : 'text-sub')}>
              {up ? '▲ Above the pivot' : dn ? '▼ Below the pivot' : 'On the pivot'}
            </span>
            <h2 className="text-xl font-bold tracking-tight sm:text-2xl">{up ? 'Watch the upside targets' : dn ? 'Watch the downside targets' : 'Waiting for a side'}</h2>
            <p className="max-w-md text-sm text-sub">
              {name} is <b className="num text-fg">{fmt(Math.abs(s.distanceFromPivot))}</b> points {up ? 'above' : dn ? 'below' : 'at'} last week's average.{' '}
              {up ? 'The green levels apply while it stays above the pivot.' : dn ? 'The red levels apply while it stays below the pivot.' : ''}
            </p>
            <span className="text-sm text-sub">
              Flip level <b className="num text-warn">{fmt(r.avg)}</b>
              {up ? '. A move below it switches to the downside targets.' : dn ? '. A move above it switches to the upside targets.' : ''}
            </span>
          </>
        ) : (
          <h2 className="text-xl font-bold">Type a price to see the side</h2>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-line p-5 sm:p-6 lg:border-l lg:border-t-0">
        <div className="grid min-w-0 gap-1">
          <span className="label">Next target</span>
          {nt ? (
            <>
              <span className="num text-[1.9rem] font-semibold tracking-tight">{fmt(nt.price)}</span>
              <span className="text-sm text-sub">{nt.side === 'up' ? '▲' : '▼'} Last week's {BASE_WORD[nt.base]} {nt.side === 'up' ? '+' : '−'} step</span>
              <span className="text-sm"><b className="num">{fmt(Math.abs(nt.distance))}</b> pts to go</span>
            </>
          ) : (
            <span className="text-sm text-sub">{s ? 'Every target on this side is passed. Try a larger step.' : '—'}</span>
          )}
        </div>
        {nt && (
          <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`${Math.round(done * 100)}% of the way from the pivot`} className="shrink-0">
            <circle cx="42" cy="42" r="34" fill="none" stroke={C.line} strokeWidth="8" />
            <circle cx="42" cy="42" r="34" fill="none" stroke={nt.side === 'up' ? C.up : C.down} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${ring * done} ${ring}`} transform="rotate(-90 42 42)" />
            <text x="42" y="47" textAnchor="middle" fontSize="15" fontWeight="600" fill={C.fg} className="font-mono">{Math.round(done * 100)}%</text>
          </svg>
        )}
      </div>
    </section>
  );
}

// ---------- Rail ----------
function useWidth<T extends HTMLElement | SVGSVGElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(800);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.getBoundingClientRect().width || 800));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function Rail({ r, s, div, price, week, hl, setHl, onPrice, step }: {
  r: WeeklyResult; s: Signal | null; div: Divisor; price: number; week: WeekSoFar | null; hl: string | null;
  setHl: (k: string | null) => void; onPrice: (p: number) => void; step: number;
}) {
  const [ref, width] = useWidth<SVGSVGElement>();
  const [tip, setTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const dragging = useRef(false);
  const W = Math.max(300, width), H = 230, pad = 24, railY = 116, narrow = W < 560;
  const lv = levels(r, div);
  const vals = [...lv.map((l) => l.price), r.avg, r.inputs.high, r.inputs.low, r.inputs.close];
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const m = (hi - lo) * 0.06;
  lo -= m; hi += m;
  if (Number.isFinite(price)) { if (price < lo) lo = price - m; if (price > hi) hi = price + m; }
  const X = (p: number) => pad + ((p - lo) / (hi - lo)) * (W - 2 * pad);
  const px = X(r.avg);
  const valueAt = (clientX: number) => {
    const b = ref.current!.getBoundingClientRect();
    const x = ((clientX - b.left) / b.width) * W;
    return lo + clamp((x - pad) / (W - 2 * pad), 0, 1) * (hi - lo);
  };
  const onDown = (e: RPointerEvent<SVGSVGElement>) => { e.preventDefault(); dragging.current = true; setTip(null); e.currentTarget.setPointerCapture(e.pointerId); onPrice(valueAt(e.clientX)); };
  const onMove = (e: RPointerEvent<SVGSVGElement>) => { if (dragging.current) onPrice(valueAt(e.clientX)); };
  const onUp = () => { dragging.current = false; };
  const onKey = (e: RKeyboardEvent<SVGSVGElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' || !Number.isFinite(price)) return;
    e.preventDefault();
    onPrice(clamp(price + (e.key === 'ArrowRight' ? 1 : -1) * (step / (e.shiftKey ? 1 : 10)), lo, hi));
  };
  const showTip = (x: number, y: number, lines: string[]) => setTip({ x: clamp(x, 100, W - 100), y, lines });

  const lane = (side: 'up' | 'down') => {
    const arr = lv.filter((l) => l.side === side).sort((a, b) => a.price - b.price);
    let last = -1e9, row = 0;
    return arr.map((l: Level) => {
      const x = X(l.price);
      const st = s?.all.find((a) => a.key === l.key);
      const active = s && ((s.bias === 'bullish' && side === 'up') || (s.bias === 'bearish' && side === 'down'));
      const isNext = s?.nextTarget?.key === l.key, hit = !!st?.hit, isHl = hl === l.key;
      row = x - last < (narrow ? 58 : 70) ? (row ? 0 : 1) : 0;
      last = x;
      const col = side === 'up' ? C.up : C.down;
      const my = railY + (side === 'up' ? -18 : 18);
      const ly = side === 'up' ? (row ? 22 : 42) : (row ? 220 : 200);
      const lines = [`${side === 'up' ? 'Upside' : 'Downside'} target · last week's ${BASE_WORD[l.base]} ${side === 'up' ? '+' : '−'} step`, fmt(l.price),
        ...(Number.isFinite(price) ? [`${sgn(l.price - price)} pts from price`] : []), ...(hit ? ['Hit this week'] : [])];
      return (
        <g key={l.key} opacity={s && !active && !isHl ? 0.45 : 1} onPointerEnter={() => { setHl(l.key); showTip(x, Math.min(my, ly) - 6, lines); }} onPointerLeave={() => { setHl(null); setTip(null); }}>
          <line x1={x} x2={x} y1={railY} y2={my} stroke={col} strokeOpacity={0.5} />
          {isNext && <circle cx={x} cy={my} r={11} fill="none" stroke={C.pivot} strokeWidth={2} />}
          <circle cx={x} cy={my} r={isHl ? 7.5 : 6} fill={hit ? col : C.surface} stroke={col} strokeWidth={2.5} />
          {(!narrow || isNext || isHl) && (
            <text x={clamp(x, 34, W - 34)} y={ly} fontSize={11.5} fontWeight={isNext || isHl ? 600 : 500} fill={isNext ? C.fg : col} textAnchor="middle" className="font-mono">{fmt(l.price, 0)}</text>
          )}
          <rect x={x - 12} y={Math.min(my, ly) - 14} width={24} height={Math.abs(ly - my) + 26} fill="transparent" />
        </g>
      );
    });
  };

  const hx = Number.isFinite(price) ? X(price) : NaN;
  const lab = fmt(price), lw = lab.length * 7.4 + 18, lx = clamp(hx - lw / 2, 2, W - lw - 2);
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="block h-[230px] w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-xl"
        role="slider"
        tabIndex={0}
        aria-label="Current price on the weekly range"
        aria-valuemin={Number(lo.toFixed(2))}
        aria-valuemax={Number(hi.toFixed(2))}
        aria-valuenow={Number.isFinite(price) ? Number(price.toFixed(2)) : undefined}
        aria-valuetext={Number.isFinite(price) ? `${fmt(price)}${s ? (s.bias === 'bullish' ? ', above' : ', below') + ' the pivot ' + fmt(r.avg) : ''}` : 'no price'}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onKeyDown={onKey}
      >
        <rect x={pad} y={railY - 4} width={Math.max(0, px - pad)} height={8} rx={4} fill={C.down} opacity={0.14} />
        <rect x={px} y={railY - 4} width={Math.max(0, W - pad - px)} height={8} rx={4} fill={C.up} opacity={0.14} />
        {Number.isFinite(price) && (
          <rect x={Math.min(px, hx)} y={railY - 4} width={Math.abs(hx - px)} height={8} fill={price >= r.avg ? C.up : C.down} opacity={0.4} />
        )}
        {week && <rect x={X(week.low)} y={railY + 10} width={Math.max(2, X(week.high) - X(week.low))} height={3} rx={1.5} fill={C.brand} opacity={0.7}><title>This week so far</title></rect>}
        <line x1={px} x2={px} y1={railY - 26} y2={railY + 26} stroke={C.pivot} strokeWidth={2} />
        <g onPointerEnter={() => showTip(px, railY + 30, ["Pivot · last week's average", fmt(r.avg)])} onPointerLeave={() => setTip(null)}>
          <rect x={px - 32} y={railY + 30} width={64} height={32} fill="transparent" />
          <text x={px} y={railY + 44} fontSize={11} fontWeight={700} fill={C.pivot} textAnchor="middle" letterSpacing=".06em">PIVOT</text>
          <text x={px} y={railY + 58} fontSize={11.5} fill={C.pivot} textAnchor="middle" className="font-mono">{fmt(r.avg)}</text>
        </g>
        {(['high', 'low', 'close'] as const).map((b) => {
          const x = X(r.inputs[b]);
          return (
            <g key={b} onPointerEnter={() => showTip(x, railY - 14, [`Last week's ${b}`, fmt(r.inputs[b])])} onPointerLeave={() => setTip(null)}>
              <line x1={x} x2={x} y1={railY - 9} y2={railY + 9} stroke={C.sub} strokeWidth={2} />
              <rect x={x - 8} y={railY - 12} width={16} height={24} fill="transparent" />
            </g>
          );
        })}
        {lane('up')}
        {lane('down')}
        {Number.isFinite(price) && (
          <g className="cursor-grab active:cursor-grabbing">
            <line x1={hx} x2={hx} y1={railY - 28} y2={railY + 30} stroke={C.fg} strokeWidth={2} />
            <circle cx={hx} cy={railY} r={11} fill={C.fg} stroke={C.surface} strokeWidth={3} />
            <rect x={lx} y={railY - 50} width={lw} height={22} rx={11} fill={C.fg} />
            <text x={lx + lw / 2} y={railY - 35} fontSize={12} fontWeight={600} fill={C.surface} textAnchor="middle" className="font-mono">{lab}</text>
          </g>
        )}
      </svg>
      {tip && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-fg px-2.5 py-1.5 text-xs leading-snug text-bg shadow-lg"
          style={{ left: `${(tip.x / W) * 100}%`, top: tip.y - 6 }}>
          {tip.lines.map((t, i) => <div key={i} className={i === 1 ? 'num font-semibold' : undefined}>{t}</div>)}
        </div>
      )}
    </div>
  );
}

// ---------- Lists ----------
function TargetList({ side, r, s, div, step, price, hl, setHl }: {
  side: 'up' | 'down'; r: WeeklyResult; s: Signal | null; div: Divisor; step: number; price: number; hl: string | null; setHl: (k: string | null) => void;
}) {
  const active = !!s && ((s.bias === 'bullish' && side === 'up') || (s.bias === 'bearish' && side === 'down'));
  const arr = levels(r, div).filter((l) => l.side === side).sort((a, b) => (side === 'up' ? a.price - b.price : b.price - a.price));
  return (
    <section className={clsx('card card-pad transition-opacity', s && !active && 'opacity-60')} onPointerLeave={() => setHl(null)}>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <span className={side === 'up' ? 'text-up' : 'text-down'}>{side === 'up' ? '▲' : '▼'}</span>
          {side === 'up' ? 'Upside targets' : 'Downside targets'}
          {s && <Badge tone={active ? 'brand' : 'neutral'}>{active ? 'In play' : 'If it flips'}</Badge>}
        </h2>
        <span className="label">{STEP_LABEL[div]} · step {fmt(step)}</span>
      </header>
      <div className="grid gap-1">
        {arr.map((l) => {
          const st = s?.all.find((a) => a.key === l.key);
          const reached = Number.isFinite(price) && (side === 'up' ? price >= l.price : price <= l.price);
          const isNext = s?.nextTarget?.key === l.key;
          const span = Math.abs(l.price - r.avg);
          const towards = Number.isFinite(price) && (side === 'up' ? price > r.avg : price < r.avg);
          const pct = reached || st?.hit ? 100 : towards && span ? clamp(Math.abs(price - r.avg) / span, 0, 1) * 100 : 0;
          const b = baseValue(r, l.base);
          return (
            <div key={l.key} onPointerEnter={() => setHl(l.key)}
              className={clsx('grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 rounded-xl px-3 py-2.5 transition-colors', hl === l.key ? 'bg-muted' : 'hover:bg-muted')}>
              <span className={clsx('text-center text-xs', side === 'up' ? 'text-up' : 'text-down')}>{side === 'up' ? '▲' : '▼'}</span>
              <span className="min-w-0">
                <span className="text-sm font-semibold">From last week's {BASE_WORD[l.base]}</span>
                {isNext ? <Badge tone="warn" className="ml-2">Next</Badge> : st?.hit ? <Badge className="ml-2">Hit</Badge> : reached ? <Badge className="ml-2">Passed</Badge> : null}
                <span className="block text-xs text-sub">{fmt(b)} {side === 'up' ? '+' : '−'} {fmt(step)}</span>
              </span>
              <span className="text-right">
                <span className="num block font-semibold">{fmt(l.price)}</span>
                <span className="num block text-xs text-sub">{Number.isFinite(price) ? sgn(l.price - price) : ''}</span>
              </span>
              <span className="col-start-2 col-end-4 h-1 overflow-hidden rounded-full bg-muted">
                <span className={clsx('block h-full rounded-full transition-[width]', side === 'up' ? 'bg-up' : 'bg-down')} style={{ width: `${pct}%` }} />
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ---------- Inputs panel ----------
function InputsPanel({ title, v, err, onField, onReset, onClose }: {
  title: string; v: Inputs; err: string | null; onField: (f: keyof Inputs, n: number) => void; onReset: () => void; onClose: () => void;
}) {
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const field = (f: keyof Inputs, label: string, wide = false, ref?: typeof first) => (
    <label className={clsx('grid gap-1', wide && 'col-span-2')}>
      <span className="text-xs font-medium text-sub">{label}</span>
      <input ref={ref} className="input num" inputMode="decimal" placeholder="—"
        defaultValue={Number.isFinite(v[f]) ? String(Math.round(v[f] * 10000) / 10000) : ''}
        onChange={(e) => onField(f, toNum(e.target.value))} />
    </label>
  );
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 grid w-full max-w-sm content-start gap-4 overflow-y-auto bg-surface p-5 shadow-2xl" role="dialog" aria-modal="true" aria-label="Inputs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Inputs</h2>
          <button className="btn-ghost px-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <p className="-mt-2 text-sm text-sub">{title}</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="label col-span-2">Last week · index</div>
          {field('high', 'High', false, first)}
          {field('low', 'Low')}
          {field('close', 'Close', true)}
          <div className="label col-span-2 mt-1">Last week · India VIX</div>
          {field('vixHigh', 'VIX high')}
          {field('vixLow', 'VIX low')}
          <div className="label col-span-2 mt-1">This week so far (optional)</div>
          {field('wkHigh', 'High so far')}
          {field('wkLow', 'Low so far')}
        </div>
        {err && <p className="text-sm text-down">{err}</p>}
        <div className="flex gap-2">
          <button className="btn border border-line" onClick={() => { onReset(); onClose(); }}>Reset to loaded data</button>
          <button className="btn bg-fg text-bg" onClick={onClose}>Done</button>
        </div>
      </aside>
    </>
  );
}
