import type { Ipo, IpoVerdict, Rating, Stock } from '../types';

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export interface Pillar {
  key: string;
  label: string;
  score: number;
  note: string;
}

/**
 * Rule-based scorecard derived from the stored fundamentals. It complements
 * (not replaces) the analyst rating: it makes the trade-offs visible.
 */
export function stockPillars(s: Stock): Pillar[] {
  const m = s.metrics;
  const peg = m.epsGrowth3y > 0 ? m.forwardPe / m.epsGrowth3y : 5;
  const valuation = clamp(peg <= 0.8 ? 92 : peg <= 1.2 ? 80 : peg <= 1.8 ? 64 : peg <= 2.5 ? 48 : peg <= 3.5 ? 34 : 20);
  const growth = clamp(25 + m.revGrowth3y * 1.6 + m.epsGrowth3y * 1.3);
  const profitability = clamp(m.roe * 2.2 + m.netMargin * 1.4);
  const health = s.isFinancial
    ? clamp(78 - Math.max(0, m.debtEquity - 6) * 4)
    : clamp(m.debtEquity <= 0.2 ? 92 : m.debtEquity <= 0.5 ? 80 : m.debtEquity <= 1 ? 64 : m.debtEquity <= 2 ? 46 : 30);
  const range = s.high52 - s.low52;
  const momentum = clamp(range > 0 ? 20 + ((s.price - s.low52) / range) * 75 : 50);

  return [
    { key: 'val', label: 'Valuation', score: Math.round(valuation), note: `PEG ${peg.toFixed(2)} (fwd P/E ÷ 3Y EPS CAGR)` },
    { key: 'gro', label: 'Growth', score: Math.round(growth), note: `Revenue ${m.revGrowth3y}% · EPS ${m.epsGrowth3y}% (3Y CAGR)` },
    { key: 'pro', label: 'Profitability', score: Math.round(profitability), note: `ROE ${m.roe}% · Net margin ${m.netMargin}%` },
    { key: 'hea', label: 'Balance sheet', score: Math.round(health), note: s.isFinancial ? 'Lender: leverage judged vs. capital adequacy' : `Debt/Equity ${m.debtEquity}x` },
    { key: 'mom', label: 'Momentum', score: Math.round(momentum), note: 'Position inside 52-week range' },
  ];
}

export function overallScore(s: Stock): number {
  const p = stockPillars(s);
  const w = [0.22, 0.24, 0.24, 0.16, 0.14];
  return Math.round(p.reduce((acc, x, i) => acc + x.score * w[i], 0));
}

export const ratingTone: Record<Rating, 'up' | 'brand' | 'warn' | 'down'> = {
  'Strong Buy': 'up',
  Buy: 'up',
  Accumulate: 'brand',
  Hold: 'warn',
  Reduce: 'down',
  Sell: 'down',
};

export const verdictTone: Record<IpoVerdict, 'up' | 'brand' | 'warn' | 'down'> = {
  Apply: 'up',
  'Apply · Long Term': 'up',
  'Apply · Listing Gains': 'brand',
  Neutral: 'warn',
  Avoid: 'down',
};

export function ipoScore(i: Ipo): number {
  const s = i.scores;
  return Math.round(s.business * 0.25 + s.financials * 0.25 + s.valuation * 0.2 + s.management * 0.15 + s.market * 0.15);
}

export type IpoStatus = 'Upcoming' | 'Open' | 'Closed' | 'Listed';

export function ipoStatus(i: Ipo, now = new Date()): IpoStatus {
  const day = (iso: string) => new Date(iso + 'T00:00:00');
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (today < day(i.openDate)) return 'Upcoming';
  if (today <= day(i.closeDate)) return 'Open';
  if (today < day(i.listingDate)) return 'Closed';
  return 'Listed';
}
