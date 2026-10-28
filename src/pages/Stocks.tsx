import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LayoutGrid, List, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import { stocks, sectorsFor, STOCK_SNAPSHOT } from '../data';
import StockCard, { WatchButton, flag } from '../components/StockCard';
import { Badge, EmptyState, ScoreRing, Segmented } from '../components/ui';
import { change, fmtMcap, fmtPrice, pct } from '../lib/format';
import { overallScore, ratingTone } from '../lib/scoring';
import { useWatchlist } from '../lib/watchlist';
import { useLiveStocks } from '../lib/live';
import { ChangeTag, LiveDot } from '../components/live';
import type { Market, Rating } from '../types';

type SortKey = 'upside' | 'score' | 'mcap' | 'pe' | 'growth' | 'roe';
const sorts: { value: SortKey; label: string }[] = [
  { value: 'upside', label: 'Upside to fair value' },
  { value: 'score', label: 'Composite score' },
  { value: 'mcap', label: 'Market cap' },
  { value: 'growth', label: 'EPS growth (3Y)' },
  { value: 'roe', label: 'ROE' },
  { value: 'pe', label: 'P/E (low → high)' },
];
const ratings: (Rating | 'All')[] = ['All', 'Strong Buy', 'Buy', 'Accumulate', 'Hold', 'Reduce', 'Sell'];

export default function Stocks() {
  const [params, setParams] = useSearchParams();
  const market = (params.get('market') as Market | null) ?? 'ALL';
  const sector = params.get('sector') ?? 'All';
  const q = params.get('q') ?? '';
  const sort = (params.get('sort') as SortKey | null) ?? 'upside';
  const rating = (params.get('rating') as Rating | null) ?? 'All';
  const view = params.get('view') === 'table' ? 'table' : 'grid';
  const onlyWatch = params.get('watch') === '1';
  const { list: watch } = useWatchlist();
  const { stocks: live, status } = useLiveStocks(stocks);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === '' || v === 'All' || v === 'ALL') next.delete(k);
    else next.set(k, v);
    if (k === 'market') next.delete('sector');
    setParams(next, { replace: true });
  };

  const sectors = sectorsFor(market as Market | 'ALL');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = live.filter(
      (s) =>
        (market === 'ALL' || s.market === market) &&
        (sector === 'All' || s.sector === sector) &&
        (rating === 'All' || s.rating === rating) &&
        (!onlyWatch || watch.includes(`${s.market}:${s.symbol}`)) &&
        (!needle || s.symbol.toLowerCase().includes(needle) || s.name.toLowerCase().includes(needle) || s.industry.toLowerCase().includes(needle)),
    );
    // Market caps are in different currencies; convert INR to USD (~₹88/$) only for sorting.
    const usd = (b: number, m: Market) => (m === 'IN' ? b / 88 : b);
    const key: Record<SortKey, (s: (typeof r)[number]) => number> = {
      upside: (s) => -change(s.price, s.fairValue),
      score: (s) => -overallScore(s),
      mcap: (s) => -usd(s.marketCap, s.market),
      growth: (s) => -s.metrics.epsGrowth3y,
      roe: (s) => -s.metrics.roe,
      pe: (s) => s.metrics.pe,
    };
    return r.sort((a, b) => key[sort](a) - key[sort](b));
  }, [live, market, sector, rating, q, sort, onlyWatch, watch]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stock research</h1>
          <p className="mt-1 text-sm text-sub">Filter by market and sector. {status === 'live' ? 'Prices refresh every minute; valuation multiples re-base to the live price.' : `Showing ${STOCK_SNAPSHOT} research-snapshot prices (live feed unavailable).`}</p>
        </div>
        <Segmented value={market as Market | 'ALL'} onChange={(v) => set('market', v)} options={[{ value: 'ALL', label: 'All markets' }, { value: 'IN', label: '🇮🇳 India' }, { value: 'US', label: '🇺🇸 US' }]} />
      </div>

      <div className="card mb-6 space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sub" />
            <input className="input pl-10" placeholder="Search by name, symbol or industry…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Search stocks" />
          </label>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <select className="input md:w-44" value={rating} onChange={(e) => set('rating', e.target.value)} aria-label="Filter by rating">
              {ratings.map((r) => <option key={r} value={r}>{r === 'All' ? 'All ratings' : r}</option>)}
            </select>
            <select className="input md:w-52" value={sort} onChange={(e) => set('sort', e.target.value === 'upside' ? null : e.target.value)} aria-label="Sort">
              {sorts.map((s) => <option key={s.value} value={s.value}>Sort: {s.label}</option>)}
            </select>
          </div>
        </div>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
          {['All', ...sectors].map((s) => (
            <button key={s} onClick={() => set('sector', s)} className={clsx('chip', sector === s && 'chip-active')}>{s === 'All' ? 'All sectors' : s}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-3 text-sm text-sub">
            <span><span className="font-semibold text-fg">{rows.length}</span> results</span>
            <button onClick={() => set('watch', onlyWatch ? null : '1')} className={clsx('chip !py-1', onlyWatch && 'chip-active')}>
              <Star size={13} fill={onlyWatch ? 'currentColor' : 'none'} /> Watchlist ({watch.length})
            </button>
          </div>
          <Segmented size="sm" value={view} onChange={(v) => set('view', v === 'grid' ? null : v)} options={[{ value: 'grid', label: <span className="flex items-center gap-1.5"><LayoutGrid size={14} /> Cards</span> }, { value: 'table', label: <span className="flex items-center gap-1.5"><List size={14} /> Table</span> }]} />
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No stocks match" body={onlyWatch ? 'Your watchlist is empty for these filters. Tap the star on any stock to add it.' : 'Try clearing a filter or searching for something else.'} action={<button className="btn-ghost border border-line" onClick={() => setParams({})}>Reset filters</button>} />
      ) : view === 'grid' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => <StockCard key={s.market + s.symbol} s={s} status={status} />)}
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Company</th><th>Sector</th><th className="!text-right">Price</th><th className="!text-right">Day</th><th className="!text-right">Mcap</th><th className="!text-right">P/E</th><th className="!text-right">ROE</th><th className="!text-right">EPS 3Y</th><th>Rating</th><th className="!text-right">Upside</th><th className="!text-center">Score</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const up = change(s.price, s.fairValue);
                return (
                  <tr key={s.market + s.symbol} className="transition-colors hover:bg-muted/50">
                    <td>
                      <Link to={`/stocks/${s.market}/${encodeURIComponent(s.symbol)}`} className="flex items-center gap-2.5 hover:text-brand">
                        <span>{flag(s.market)}</span>
                        <span><span className="block font-semibold">{s.symbol}</span><span className="block max-w-[12rem] truncate text-xs text-sub">{s.name}</span></span>
                      </Link>
                    </td>
                    <td className="text-sub">{s.sector}</td>
                    <td className="num text-right font-medium">{fmtPrice(s.price, s.market)}</td>
                    <td className="text-right">{s.quote ? <ChangeTag q={s.quote} className="!text-xs" /> : <LiveDot status={status} />}</td>
                    <td className="num text-right text-sub">{fmtMcap(s.marketCap, s.market)}</td>
                    <td className="num text-right">{s.metrics.pe.toFixed(1)}</td>
                    <td className="num text-right">{s.metrics.roe}%</td>
                    <td className={clsx('num text-right', s.metrics.epsGrowth3y >= 0 ? 'text-up' : 'text-down')}>{pct(s.metrics.epsGrowth3y, 0)}</td>
                    <td><Badge tone={ratingTone[s.rating]}>{s.rating}</Badge></td>
                    <td className={clsx('num text-right font-semibold', up >= 0 ? 'text-up' : 'text-down')}>{pct(up)}</td>
                    <td className="text-center"><ScoreRing score={overallScore(s)} size={38} /></td>
                    <td><WatchButton id={`${s.market}:${s.symbol}`} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
