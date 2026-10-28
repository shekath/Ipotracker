/**
 * Weekly index range targets (VIX-range model).
 *
 *   Avg   = (prev week High + prev week Low) / 2           the pivot
 *   VIXavg = (prev week India VIX High + Low) / 2
 *   Range = (Avg × VIXavg/100 + Avg) / VIXavg
 *   Step  = Range / divisor   (4 = primary, 2 = half, 1 = full range)
 *   Upside targets   = prev Avg / High / Low / Close + Step
 *   Downside targets = prev Avg / High / Low / Close − Step
 *
 * Above the pivot the upside targets are in play; below it, the downside ones.
 */

export type Base = 'avg' | 'high' | 'low' | 'close';
export type Side = 'up' | 'down';
export type Divisor = 1 | 2 | 4;
export type Bias = 'bullish' | 'bearish' | 'neutral';

export interface PrevWeek {
  high: number;
  low: number;
  close: number;
  vixHigh: number;
  vixLow: number;
}

export interface Level {
  side: Side;
  base: Base;
  price: number;
  key: string;
}

export interface WeeklyResult {
  inputs: PrevWeek;
  avg: number;
  vixAvg: number;
  vixPct: number;
  range: number;
}

export interface WeekSoFar {
  high: number;
  low: number;
}

export interface LevelState extends Level {
  hit: boolean | null;
  distance: number;
}

export interface Signal {
  price: number;
  bias: Bias;
  pivot: number;
  distanceFromPivot: number;
  nextTarget: LevelState | null;
  targets: LevelState[];
  all: LevelState[];
}

export const BASES: Base[] = ['avg', 'high', 'low', 'close'];
export const DIVISORS: Divisor[] = [4, 2, 1];

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export function computeRange(prev: PrevWeek): WeeklyResult {
  const { high, low, close, vixHigh, vixLow } = prev;
  for (const [k, v] of Object.entries({ high, low, close, vixHigh, vixLow })) {
    if (!finite(v)) throw new Error(`Missing or invalid ${k}`);
  }
  if (high < low) throw new Error('Previous week high is below the low');
  if (vixHigh < vixLow) throw new Error('VIX high is below VIX low');
  const avg = (high + low) / 2;
  const vixAvg = (vixHigh + vixLow) / 2;
  if (vixAvg <= 0) throw new Error('VIX average must be above zero');
  const vixPct = vixAvg / 100;
  const range = (avg * vixPct + avg) / vixAvg;
  return { inputs: { high, low, close, vixHigh, vixLow }, avg, vixAvg, vixPct, range };
}

export function baseValue(r: WeeklyResult, b: Base): number {
  return b === 'avg' ? r.avg : r.inputs[b];
}

/** All eight levels for one step size, sorted high → low. */
export function levels(r: WeeklyResult, divisor: Divisor): Level[] {
  const step = r.range / divisor;
  const out: Level[] = [];
  for (const base of BASES) {
    out.push({ side: 'up', base, price: baseValue(r, base) + step, key: `up:${base}` });
    out.push({ side: 'down', base, price: baseValue(r, base) - step, key: `down:${base}` });
  }
  return out.sort((a, b) => b.price - a.price);
}

export function signal(r: WeeklyResult, price: number, divisor: Divisor, week?: WeekSoFar | null): Signal {
  const bias: Bias = price > r.avg ? 'bullish' : price < r.avg ? 'bearish' : 'neutral';
  const all: LevelState[] = levels(r, divisor).map((l) => ({
    ...l,
    hit: week ? (l.side === 'up' ? week.high >= l.price : week.low <= l.price) : null,
    distance: l.price - price,
  }));
  const targets = all.filter((l) => (bias === 'bullish' ? l.side === 'up' : bias === 'bearish' ? l.side === 'down' : false));
  const ahead = targets
    .filter((l) => (bias === 'bullish' ? l.price > price : l.price < price))
    .sort((a, b) => Math.abs(a.distance) - Math.abs(b.distance));
  return { price, bias, pivot: r.avg, distanceFromPivot: price - r.avg, nextTarget: ahead[0] ?? null, targets, all };
}

// ---------- Data feed ----------

export type IndexKey = 'NIFTY' | 'BANKNIFTY' | 'SENSEX';
export const INDEX_KEYS: IndexKey[] = ['NIFTY', 'BANKNIFTY', 'SENSEX'];
export const INDEX_NAMES: Record<IndexKey, string> = { NIFTY: 'Nifty 50', BANKNIFTY: 'Nifty Bank', SENSEX: 'Sensex' };

export interface WeeklyFeedItem {
  index: IndexKey;
  source: string;
  prevWeekLabel: string;
  prev: PrevWeek;
  current: { price?: number; high?: number; low?: number; asOf?: string } | null;
  prevDay: { close: number; date: string } | null;
  stale?: boolean;
}
export type WeeklyFeed = Record<IndexKey, WeeklyFeedItem>;

/** The default "current price" (and what Reset returns to): the previous weekly candle's close. */
export function defaultPrice(d: WeeklyFeedItem | undefined): number {
  return d && finite(d.prev.close) ? d.prev.close : NaN;
}
