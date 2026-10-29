import { useEffect, useState } from 'react';
import { getJSON } from './api';
import type { Market } from '../types';

/** Factor percentiles (0–100) within the market; null when there isn't enough data. */
export interface Factors {
  value: number | null;
  quality: number | null;
  growth: number | null;
  momentum: number | null;
  trend: number | null;
  risk: number | null;
  analyst: number | null;
}

export type Horizon = 'st' | 'lt' | 'sw';

export interface Tech {
  px: number;
  sma20: number | null;
  sma50: number | null;
  sma200: number | null;
  rsi: number | null;
  atr: number | null;
  atrPct: number | null;
  r1m: number | null;
  r3m: number | null;
  r6m: number | null;
  r12m: number | null;
  mom121: number | null;
  vol: number | null;
  dd: number | null;
  from52h: number | null;
  trendSlope: number | null;
  trendR2: number | null;
  volRatio: number | null;
  turnover: number | null;
}

export interface Fund {
  roe?: number | null;
  opMargin?: number | null;
  netMargin?: number | null;
  revGrowth?: number | null;
  epsGrowth?: number | null;
  de?: number | null;
  target?: number | null;
  targetHigh?: number | null;
  targetLow?: number | null;
  rec?: number | null;
  analysts?: number | null;
  fwdEps?: number | null;
  ttmEps?: number | null;
  evEbitda?: number | null;
  beta?: number | null;
  nextEarnings?: number | null;
}

export interface Plan {
  entry: [number, number];
  stop: number;
  target: number;
  target2?: number;
  horizon: string;
  rr: number;
  score?: number;
  type?: 'Breakout' | 'Pullback';
  own?: { n: number; win: number; avgR: number };
  pool?: { n: number; win: number; avgR: number };
}

export interface ResearchRow {
  symbol: string;
  name: string;
  sector: string | null;
  cap: string | null;
  idx: string[];
  price: number | null;
  chg: number | null;
  mcap: number | null;
  pe: number | null;
  fpe: number | null;
  pb: number | null;
  dy: number | null;
  lt: number | null;
  st: number | null;
  setup: string | null;
  F: Factors;
  flags: string[];
  pk: Horizon[];
}

export interface Pick {
  symbol: string;
  name: string;
  sector: string | null;
  cap: string | null;
  idx: string[];
  price: number | null;
  chg: number | null;
  F: Factors;
  flags: string[];
  plan: Plan;
  tech: Tech | null;
  fund: Fund | null;
}

export interface Regime {
  state: 'risk-on' | 'mixed' | 'risk-off' | 'unknown';
  label: string;
  bar: number;
}

export interface ResearchData {
  market: Market;
  asOf: number;
  regime: Regime;
  universe: number;
  coverage: { history: number; fundamentals: number };
  building: boolean;
  swingPool: Record<string, { n: number; win: number; avgR: number }>;
  picks: Record<Horizon, Pick[]>;
  rows: ResearchRow[];
}

export interface ResearchStock extends Omit<ResearchRow, 'pk'> {
  picks: Partial<Record<Horizon, Plan>> | null;
  tech: Tech | null;
  fund: Fund | null;
  secPe: number | null;
  secFpe: number | null;
  bt: Record<string, { n: number; win: number; avgR: number }> | null;
}

const cache = new Map<Market, { at: number; data: ResearchData }>();
const TTL = 5 * 60_000;

/** Research table and picks for a market (produced by the server's research cron). */
export function useResearch(market: Market) {
  const [state, setState] = useState<{ data?: ResearchData; error?: 'offline' | 'pending'; loading: boolean }>(() => ({ data: cache.get(market)?.data, loading: !cache.has(market) }));
  useEffect(() => {
    let alive = true;
    const hit = cache.get(market);
    setState({ data: hit?.data, loading: !hit });
    if (hit && Date.now() - hit.at < TTL) return;
    getJSON<ResearchData>(`research.php?market=${market}`, 30000)
      .then((d) => {
        cache.set(market, { at: Date.now(), data: d });
        if (alive) setState({ data: d, loading: false });
      })
      .catch((e: Error) => alive && setState((s) => ({ ...s, loading: false, error: /503/.test(e.message) ? 'pending' : 'offline' })));
    return () => {
      alive = false;
    };
  }, [market]);
  return state;
}

/** Every feature for one stock. */
export function useResearchStock(market: Market, symbol: string) {
  const [state, setState] = useState<{ row?: ResearchStock; asOf?: number; missing?: boolean; loading: boolean }>({ loading: true });
  useEffect(() => {
    let alive = true;
    setState({ loading: true });
    getJSON<{ asOf: number; row: ResearchStock }>(`research.php?market=${market}&symbol=${encodeURIComponent(symbol)}`, 20000)
      .then((d) => alive && setState({ row: d.row, asOf: d.asOf, loading: false }))
      .catch(() => alive && setState({ missing: true, loading: false }));
    return () => {
      alive = false;
    };
  }, [market, symbol]);
  return state;
}

// ---------------------------------------------------------------- language

const p0 = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v * 100).toFixed(0)}%`;
const top = (pct: number) => (pct >= 99 ? 'top 1%' : `top ${Math.max(1, Math.round(100 - pct))}%`);

export const factorLabel: Record<keyof Factors, string> = {
  value: 'Value',
  quality: 'Quality',
  growth: 'Growth',
  momentum: 'Momentum',
  trend: 'Trend',
  risk: 'Low risk',
  analyst: 'Analysts',
};

export const factorHelp: Record<keyof Factors, string> = {
  value: 'Forward and trailing P/E, EV/EBITDA and P/B against the sector median',
  quality: 'Return on equity, operating and net margins, and debt',
  growth: 'Revenue and earnings growth, and expected next-year earnings',
  momentum: '12-month return excluding the last month, plus 6- and 3-month returns',
  trend: 'Price above the 50- and 200-day averages, and how straight the 6-month trend is',
  risk: 'Lower volatility and smaller drawdowns score higher',
  analyst: 'Upside to the average analyst target, adjusted for the consensus rating',
};

/**
 * Plain-language reasons behind a pick, strongest evidence first. Only facts
 * from the data: nothing here is a forecast.
 */
export function reasons(p: { F: Factors; tech: Tech | null; fund: Fund | null; price: number | null; plan?: Plan }, h: Horizon, cur: string): string[] {
  const out: { s: number; t: string }[] = [];
  const { F, tech: t, fund: f } = p;
  const add = (s: number | null, t: string | false | null | undefined) => {
    if (s != null && t) out.push({ s, t });
  };
  if (f) {
    add(F.quality, F.quality != null && F.quality >= 65 && f.roe != null && `High-quality business: return on equity ${(f.roe * 100).toFixed(0)}%${f.opMargin != null ? `, operating margin ${(f.opMargin * 100).toFixed(0)}%` : ''} (${top(F.quality)} for quality).`);
    add(F.growth, F.growth != null && F.growth >= 60 && (f.revGrowth != null || f.epsGrowth != null) && `Growing: revenue ${f.revGrowth != null ? p0(f.revGrowth) : 'n/a'} and earnings ${f.epsGrowth != null ? p0(f.epsGrowth) : 'n/a'} year on year.`);
    add(F.value, F.value != null && F.value >= 60 && `Reasonably priced for its sector (${top(F.value)} on value).`);
    add(F.analyst, F.analyst != null && F.analyst >= 60 && f.analysts && f.target && p.price ? `${f.analysts} analysts' average target ${cur}${Math.round(f.target).toLocaleString('en-IN')} is ${p0(f.target / p.price - 1)} above the price.` : null);
  }
  if (t) {
    add(F.momentum, F.momentum != null && F.momentum >= 65 && t.r6m != null && `Strong momentum: ${p0(t.r6m)} over 6 months${t.mom121 != null ? `, ${p0(t.mom121)} over 12 months excluding the last one` : ''}.`);
    add(F.trend, F.trend != null && F.trend >= 70 && `Clean uptrend: above its 50- and 200-day averages${t.trendR2 != null ? `, trend fit R² ${t.trendR2.toFixed(2)}` : ''}.`);
    if (h === 'sw' && p.plan?.type) {
      const o = p.plan.own;
      add(100, p.plan.type === 'Breakout' ? `Breakout: closed above its 55-day high on ${t.volRatio != null ? `${t.volRatio.toFixed(1)}×` : 'higher'} recent volume.` : `Pullback in an uptrend: dipped to its 20/50-day average and is turning up (RSI ${t.rsi?.toFixed(0)}).`);
      if (o) add(99, `On this stock, the same setup hit its 2R target first in ${Math.round(o.win * 100)}% of ${o.n} past signals (average ${o.avgR >= 0 ? '+' : ''}${o.avgR.toFixed(2)}R).`);
    }
  }
  return out.sort((a, b) => b.s - a.s).slice(0, h === 'sw' ? 4 : 3).map((x) => x.t);
}

/** What could go wrong: red flags and the weakest factors. */
export function risks(p: { F: Factors; flags: string[]; tech: Tech | null }, h: Horizon): string[] {
  const r = [...p.flags];
  const weak = (Object.keys(p.F) as (keyof Factors)[]).filter((k) => p.F[k] != null && (p.F[k] as number) < 30 && k !== 'analyst');
  weak.slice(0, 2).forEach((k) => r.push(`Weak on ${factorLabel[k].toLowerCase()} (bottom ${Math.max(1, Math.round(p.F[k] as number))}%).`));
  if (p.tech?.rsi != null && p.tech.rsi > 70 && h !== 'lt') r.push(`Short-term stretched: RSI ${p.tech.rsi.toFixed(0)}.`);
  if (!r.length) r.push('No red flags in the data. The main risk is the market itself: respect the stop.');
  return r.slice(0, 3);
}

export const horizonMeta: Record<Horizon, { label: string; short: string; blurb: string }> = {
  st: { label: 'Short term', short: 'ST', blurb: '1–3 months. Ranked on momentum and trend, backed by growth and quality.' },
  lt: { label: 'Long term', short: 'LT', blurb: '12–24 months. Ranked on quality, growth and value, with momentum as a check.' },
  sw: { label: 'Swing', short: 'SW', blurb: '1–4 weeks. Live breakout or pullback setups whose record on the same stock is positive.' },
};
