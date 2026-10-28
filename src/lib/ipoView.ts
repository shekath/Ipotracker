import type { Ipo, IpoVerdict, LiveIpo, SubscriptionRow, Timeline } from '../types';
import { ipoScore } from './scoring';

/** Unified IPO record: curated research (if any) + live exchange/GMP data (if any). */
export interface IpoView {
  id: string;
  name: string;
  type: 'Mainboard' | 'SME';
  sector?: string;
  exchange: string;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  priceBand: [number, number] | null;
  lotSize?: number | null;
  issueSizeCr?: number;
  timeline: Timeline | null;
  subscription: SubscriptionRow[];
  gmpHistory: { date: string; value: number; source: string }[];
  gmp?: number;
  latestSub?: SubscriptionRow;
  verdict: IpoVerdict;
  score: number | null;
  basis: 'research' | 'signals' | 'pending';
  curated?: Ipo;
  live?: LiveIpo;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b(limited|ltd|ipo|sme|the|private|pvt|company|co|inc|india)\b\.?/g, ' ')
    .replace(/[^a-z0-9]/g, '');

export function namesMatch(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  return Math.min(x.length, y.length) >= 6 && (x.startsWith(y) || y.startsWith(x));
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Market-signal score for issues without a fundamental review: grey-market
 * premium, overall demand and institutional (QIB) demand. Returns null when
 * there is nothing to score yet.
 */
export function signalScore(gmpPct?: number, sub?: SubscriptionRow): number | null {
  const parts: [number, number][] = [];
  if (gmpPct != null) parts.push([clamp(gmpPct * 2.5, 0, 40), 40]);
  if (sub?.total != null) parts.push([clamp(Math.log2(sub.total + 1) * 8, 0, 30), 30]);
  if (sub?.qib != null) parts.push([clamp(Math.log2(sub.qib + 1) * 7.5, 0, 30), 30]);
  if (!parts.length) return null;
  const got = parts.reduce((a, p) => a + p[0], 0);
  const max = parts.reduce((a, p) => a + p[1], 0);
  // Grey-market premium alone is too thin a signal for an "Apply": cap it at 60 (Neutral).
  const hasDemand = sub?.total != null || sub?.qib != null;
  return Math.round((got / max) * (hasDemand ? 100 : 60));
}

export function signalVerdict(score: number | null): IpoVerdict {
  if (score == null) return 'Watch';
  if (score >= 65) return 'Apply · Listing Gains';
  if (score >= 45) return 'Neutral';
  return 'Avoid';
}

/** T+3 calendar estimate used when only curated dates are known. */
function curatedTimeline(c: Ipo): Timeline {
  return { open: c.openDate, close: c.closeDate, allotment: c.allotmentDate ?? c.closeDate, refund: c.listingDate, demat: c.listingDate, listing: c.listingDate, estimated: false };
}

export function mergeIpos(curated: Ipo[], live: LiveIpo[] = []): IpoView[] {
  const used = new Set<string>();
  const views: IpoView[] = curated.map((c) => {
    const l = live.find((x) => !used.has(x.id) && namesMatch(x.name, c.name));
    if (l) used.add(l.id);
    return build(c, l);
  });
  live.filter((l) => !used.has(l.id)).forEach((l) => views.push(build(undefined, l)));
  return views;
}

function build(c?: Ipo, l?: LiveIpo): IpoView {
  const subscription = l?.subscription ?? [];
  const latestSub = subscription[subscription.length - 1];
  const gmpHistory = l?.gmp ?? [];
  const gmp = gmpHistory.length ? gmpHistory[gmpHistory.length - 1].value : c?.gmp;
  const priceBand = c?.priceBand ?? l?.priceBand ?? null;
  const timeline = l?.timeline ?? (c ? curatedTimeline(c) : null);
  const gmpPct = gmp != null && priceBand ? (gmp / priceBand[1]) * 100 : undefined;
  const sig = signalScore(gmpPct, latestSub);
  return {
    id: c?.id ?? l!.id,
    name: c?.name ?? l!.name,
    type: c?.type ?? l!.type,
    sector: c?.sector,
    exchange: c?.exchange ?? (l?.symbol ? 'NSE, BSE' : 'BSE'),
    openDate: c?.openDate ?? l?.openDate ?? null,
    closeDate: c?.closeDate ?? l?.closeDate ?? null,
    listingDate: c?.listingDate ?? timeline?.listing ?? null,
    priceBand,
    lotSize: c?.lotSize ?? l?.lotSize,
    issueSizeCr: c?.issueSizeCr ?? (l?.issueShares && priceBand ? Math.round((l.issueShares * priceBand[1]) / 1e5) / 100 : undefined),
    timeline,
    subscription,
    gmpHistory,
    gmp,
    latestSub,
    verdict: c ? c.verdict : signalVerdict(sig),
    score: c ? ipoScore(c) : sig,
    basis: c ? 'research' : sig == null ? 'pending' : 'signals',
    curated: c,
    live: l,
  };
}
