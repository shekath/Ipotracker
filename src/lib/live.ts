import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { getJSON } from './api';
import type { LiveIpo, LiveQuote, SourceStatus, Stock } from '../types';

export type FeedStatus = 'loading' | 'live' | 'offline';

// ---------------- Quotes: one shared poller for every component ----------------

const QUOTE_POLL_MS = 60_000;
const quoteState = {
  quotes: {} as Record<string, LiveQuote>,
  status: 'loading' as FeedStatus,
  asOf: 0,
  version: 0,
};
const wanted = new Map<string, number>(); // id -> subscriber count
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inflight = false;
let again = false;
let failures = 0;

const emit = () => {
  quoteState.version++;
  listeners.forEach((l) => l());
};

async function pollQuotes() {
  clearTimeout(timer);
  const ids = [...wanted.keys()];
  if (inflight) {
    again = true;
    return;
  }
  if (!ids.length) return;
  if (typeof document !== 'undefined' && document.hidden) {
    timer = setTimeout(pollQuotes, QUOTE_POLL_MS);
    return;
  }
  inflight = true;
  try {
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));
    const res = await Promise.all(chunks.map((c) => getJSON<{ asOf: number; quotes: Record<string, LiveQuote> }>(`quotes.php?ids=${encodeURIComponent(c.join(','))}`)));
    res.forEach((r) => Object.assign(quoteState.quotes, r.quotes));
    quoteState.asOf = Math.max(...res.map((r) => r.asOf));
    quoteState.status = Object.keys(quoteState.quotes).length ? 'live' : 'offline';
    failures = 0;
  } catch {
    failures++;
    quoteState.status = Object.keys(quoteState.quotes).length ? 'live' : 'offline';
  } finally {
    inflight = false;
    emit();
    // Back off when the API is unreachable (e.g. static hosting without PHP).
    const delay = again ? 0 : failures ? Math.min(QUOTE_POLL_MS * 2 ** failures, 15 * 60_000) : QUOTE_POLL_MS;
    again = false;
    timer = setTimeout(pollQuotes, delay);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() / 1000 - quoteState.asOf > QUOTE_POLL_MS / 1000) pollQuotes();
  });
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Subscribe to live quotes for ids like "IN:RELIANCE". */
export function useQuotes(ids: string[]) {
  const key = ids.join(',');
  useEffect(() => {
    const newIds = ids.filter((id) => !wanted.has(id));
    ids.forEach((id) => wanted.set(id, (wanted.get(id) ?? 0) + 1));
    if (newIds.some((id) => !quoteState.quotes[id])) pollQuotes();
    return () => {
      ids.forEach((id) => {
        const n = (wanted.get(id) ?? 1) - 1;
        if (n <= 0) wanted.delete(id);
        else wanted.set(id, n);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useSyncExternalStore(subscribe, () => quoteState.version);
  return { quotes: quoteState.quotes, status: quoteState.status, asOf: quoteState.asOf };
}

export const stockId = (s: Pick<Stock, 'market' | 'symbol'>) => `${s.market}:${s.symbol}`;

export interface LiveStock extends Stock {
  quote?: LiveQuote;
  /** Live price is far from the research snapshot (split/bonus or a big move): fundamentals not rescaled. */
  snapshotMismatch?: boolean;
}

/**
 * Overlay a live quote on the research snapshot. Valuation multiples scale with
 * price (earnings and book value are unchanged between results), so P/E, P/B,
 * yield and market cap are re-based to the live price.
 */
export function withLive(s: Stock, q?: LiveQuote): LiveStock {
  if (!q || !(q.price > 0)) return s;
  const r = q.price / s.price;
  const mismatch = r < 0.5 || r > 2;
  const m = s.metrics;
  return {
    ...s,
    quote: q,
    price: q.price,
    high52: q.high52 ?? Math.max(s.high52, q.price),
    low52: q.low52 ?? Math.min(s.low52, q.price),
    snapshotMismatch: mismatch,
    ...(mismatch
      ? {}
      : {
          marketCap: s.marketCap * r,
          metrics: { ...m, pe: m.pe * r, forwardPe: m.forwardPe * r, pb: m.pb * r, dividendYield: m.dividendYield / r },
        }),
  };
}

export function useLiveStocks(list: Stock[]) {
  const ids = useMemo(() => list.map(stockId), [list]);
  const { quotes, status, asOf } = useQuotes(ids);
  const stocks = list.map((s) => withLive(s, quotes[stockId(s)]));
  return { stocks, status, asOf };
}

// ---------------- Price history ----------------

export type Range = '1mo' | '6mo' | '1y' | '5y';
const historyCache = new Map<string, [number, number][]>();

export function useHistory(id: string, range: Range) {
  const k = `${id}:${range}`;
  const [state, setState] = useState<{ points?: [number, number][]; error?: boolean }>(() => ({ points: historyCache.get(k) }));
  useEffect(() => {
    let alive = true;
    const cached = historyCache.get(k);
    setState({ points: cached });
    if (cached) return;
    getJSON<{ points: [number, number][] }>(`history.php?id=${encodeURIComponent(id)}&range=${range}`)
      .then((r) => {
        historyCache.set(k, r.points);
        if (alive) setState({ points: r.points });
      })
      .catch(() => alive && setState({ error: true }));
    return () => {
      alive = false;
    };
  }, [k, id, range]);
  return state;
}

// ---------------- IPOs ----------------

interface IpoFeed {
  asOf: number;
  lastRun: number;
  lastSuccess: number;
  sources: Record<string, SourceStatus>;
  ipos: LiveIpo[];
}

const IPO_POLL_MS = 5 * 60_000;
const ipoState: { feed?: IpoFeed; status: FeedStatus; version: number } = { status: 'loading', version: 0 };
const ipoListeners = new Set<() => void>();
let ipoTimer: ReturnType<typeof setTimeout> | undefined;
let ipoStarted = false;

async function pollIpos() {
  clearTimeout(ipoTimer);
  try {
    ipoState.feed = await getJSON<IpoFeed>('ipos.php', 30000);
    ipoState.status = 'live';
  } catch {
    if (!ipoState.feed) ipoState.status = 'offline';
  }
  ipoState.version++;
  ipoListeners.forEach((l) => l());
  ipoTimer = setTimeout(pollIpos, ipoState.status === 'offline' ? IPO_POLL_MS * 3 : IPO_POLL_MS);
}

export function useLiveIpos() {
  useEffect(() => {
    if (!ipoStarted) {
      ipoStarted = true;
      pollIpos();
    }
  }, []);
  useSyncExternalStore(
    (l) => {
      ipoListeners.add(l);
      return () => ipoListeners.delete(l);
    },
    () => ipoState.version,
  );
  return { feed: ipoState.feed, status: ipoState.status };
}
