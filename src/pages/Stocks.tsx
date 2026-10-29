import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import { stocks, STOCK_SNAPSHOT } from '../data';
import { Badge, EmptyState } from '../components/ui';
import { WatchButton } from '../components/StockCard';
import { fmtMcap, fmtPrice, pct } from '../lib/format';
import { ratingTone } from '../lib/scoring';
import { useWatchlist } from '../lib/watchlist';
import { useMarketPref } from '../lib/marketPref';
import { horizonMeta, useResearch, type Horizon, type ResearchRow } from '../lib/research';
import { RegimeBanner } from './Picks';
import type { Market } from '../types';

type SortKey = 'lt' | 'st' | 'mcap' | 'chg' | 'pe' | 'name';
type Signal = 'all' | 'any' | Horizon | 'setup' | 'reports' | 'watch';

const signals: { value: Signal; label: string }[] = [
  { value: 'all', label: 'All stocks' },
  { value: 'any', label: 'Any high-conviction pick' },
  { value: 'st', label: 'Short-term picks' },
  { value: 'lt', label: 'Long-term picks' },
  { value: 'sw', label: 'Swing picks' },
  { value: 'setup', label: 'Live swing setups (unfiltered)' },
  { value: 'reports', label: 'Analyst reports' },
  { value: 'watch', label: 'My watchlist' },
];

const fmtMcapRaw = (v: number | null, m: Market) => {
  if (v == null) return '—';
  if (m === 'IN') {
    const cr = v / 1e7;
    return cr >= 1e5 ? `₹${(cr / 1e5).toFixed(2)} L Cr` : `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
  }
  return v >= 1e12 ? `$${(v / 1e12).toFixed(2)} T` : `$${(v / 1e9).toFixed(1)} B`;
};

function Score({ v }: { v: number | null }) {
  if (v == null) return <span className="text-sub">—</span>;
  const c = v >= 80 ? 'bg-up' : v >= 50 ? 'bg-fg2' : 'bg-line2';
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-line"><i className={clsx('block h-full rounded-full', c)} style={{ width: `${v}%` }} /></span>
      <span className="num w-6 text-right">{v}</span>
    </span>
  );
}

export default function Stocks() {
  const [params, setParams] = useSearchParams();
  const [pref, setPref] = useMarketPref();
  const nav = useNavigate();
  const urlMarket = params.get('market');
  // A ?market= link selects that market once; after that the header switch is in charge.
  useEffect(() => {
    if (urlMarket !== 'IN' && urlMarket !== 'US') return;
    if (urlMarket !== pref) setPref(urlMarket);
    const next = new URLSearchParams(params);
    next.delete('market');
    setParams(next, { replace: true });
  }, [urlMarket]); // eslint-disable-line react-hooks/exhaustive-deps
  const market: Market = urlMarket === 'IN' || urlMarket === 'US' ? urlMarket : pref;

  const { data, error, loading } = useResearch(market);
  const { list: watch } = useWatchlist();
  const get = (k: string, d = '') => params.get(k) ?? d;
  const q = get('q');
  const sector = get('sector', 'All');
  const index = get('index', 'All');
  const cap = get('cap', 'All');
  const signal = get('signal', 'all') as Signal;
  const sort = (get('sort', 'lt') as SortKey) || 'lt';
  const dir = get('dir') === 'asc' ? 1 : -1;
  const [pageSize] = useState(25);
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === '' || v === 'All' || v === 'all') next.delete(k);
    else next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const curated = useMemo(() => new Map(stocks.filter((s) => s.market === market).map((s) => [s.symbol, s])), [market]);
  // Without the research feed, fall back to the curated analyst reports.
  const rows: ResearchRow[] = useMemo(() => {
    if (data) return data.rows;
    return [...curated.values()].map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector, cap: null, idx: [], price: s.price, chg: null, mcap: null, pe: s.metrics.pe, fpe: s.metrics.forwardPe, pb: s.metrics.pb, dy: s.metrics.dividendYield, lt: null, st: null, setup: null, F: { value: null, quality: null, growth: null, momentum: null, trend: null, risk: null, analyst: null }, flags: [], pk: [] }));
  }, [data, curated]);

  const sectors = useMemo(() => [...new Set(rows.map((r) => r.sector).filter(Boolean) as string[])].sort(), [rows]);
  const indices = useMemo(() => [...new Set(rows.flatMap((r) => r.idx))].sort(), [rows]);
  const caps = useMemo(() => ['Mega', 'Large', 'Mid', 'Small', 'Micro'].filter((c) => rows.some((r) => r.cap === c)), [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const r = rows.filter(
      (x) =>
        (sector === 'All' || x.sector === sector) &&
        (index === 'All' || x.idx.includes(index)) &&
        (cap === 'All' || x.cap === cap) &&
        (signal === 'all' || (signal === 'any' ? x.pk.length > 0 : signal === 'setup' ? !!x.setup : signal === 'reports' ? curated.has(x.symbol) : signal === 'watch' ? watch.includes(`${market}:${x.symbol}`) : x.pk.includes(signal))) &&
        (!needle || x.symbol.toLowerCase().includes(needle) || x.name.toLowerCase().includes(needle)),
    );
    const key: Record<SortKey, (x: ResearchRow) => number | string | null> = { lt: (x) => x.lt, st: (x) => x.st, mcap: (x) => x.mcap, chg: (x) => x.chg, pe: (x) => (x.pe != null && x.pe > 0 ? x.pe : null), name: (x) => x.name };
    return r.sort((a, b) => {
      const av = key[sort](a);
      const bv = key[sort](b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // missing values always last
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number)) * dir;
    });
  }, [rows, q, sector, index, cap, signal, sort, dir, curated, watch, market]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * pageSize, cur * pageSize);
  const th = (k: SortKey, label: string, cls = '') => (
    <th className={clsx('!text-right', cls)}>
      <button className={clsx('inline-flex min-h-7 items-center gap-1 hover:text-fg', sort === k && 'text-fg')} onClick={() => { const nd = sort === k ? (dir === -1 ? 'asc' : null) : k === 'name' || k === 'pe' ? 'asc' : null; const next = new URLSearchParams(params); next.set('sort', k); if (nd) next.set('dir', nd); else next.delete('dir'); next.delete('page'); setParams(next, { replace: true }); }}>
        {label}{sort === k && (dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
  const sel = 'input h-10 py-0 sm:h-9 md:w-auto';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.025em]">Stock research</h1>
          <p className="mt-1 max-w-3xl text-sm text-sub">
            {data ? `${data.universe.toLocaleString('en-IN')} ${market === 'IN' ? 'Indian' : 'US'} stocks scored on fundamentals and technicals. Filter by sector, index or size; open any stock for its full research.` : `Showing our ${curated.size} analyst reports (${STOCK_SNAPSHOT}). The full-market research appears once the server's research job has run.`}
          </p>
        </div>
        <Link to="/picks" className="btn bg-fg text-bg hover:opacity-90"><Star size={15} /> High-conviction picks</Link>
      </div>

      {data && <div className="mb-4"><RegimeBanner data={data} /></div>}

      <div className="card mb-4 grid gap-2.5 p-3 sm:p-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <label className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-sub" />
          <input className="input h-10 pl-9 sm:h-9" placeholder="Search name or symbol…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Search stocks" />
        </label>
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:flex-wrap">
          <select className={sel} value={signal} onChange={(e) => set('signal', e.target.value)} aria-label="Signal">{signals.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          <select className={sel} value={sector} onChange={(e) => set('sector', e.target.value)} aria-label="Sector"><option value="All">All sectors</option>{sectors.map((s) => <option key={s}>{s}</option>)}</select>
          <select className={sel} value={index} onChange={(e) => set('index', e.target.value)} aria-label="Index" disabled={!indices.length}><option value="All">All indices</option>{indices.map((s) => <option key={s}>{s}</option>)}</select>
          <select className={sel} value={cap} onChange={(e) => set('cap', e.target.value)} aria-label="Market cap" disabled={!caps.length}><option value="All">All sizes</option>{caps.map((s) => <option key={s} value={s}>{s} cap</option>)}</select>
        </div>
      </div>

      {loading && !rows.length ? (
        <div className="card h-96 animate-pulse" />
      ) : !filtered.length ? (
        <EmptyState title="No stocks match" body="Try clearing a filter or searching for something else." action={<button className="btn-ghost border border-line" onClick={() => setParams({})}>Reset filters</button>} />
      ) : (
        <div className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-[0.8125rem] text-sub sm:px-5">
            <span><b className="num text-fg">{filtered.length.toLocaleString('en-IN')}</b> stocks{data?.building ? ` · research still building (${data.coverage.history}/${data.universe})` : ''}</span>
            {error === 'offline' && <span className="text-warn">Live research unavailable: showing analyst reports only</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th><button className={clsx('inline-flex min-h-7 items-center gap-1 hover:text-fg', sort === 'name' && 'text-fg')} onClick={() => set('sort', 'name')}>Stock</button></th>
                  <th className="hidden lg:table-cell">Sector</th>
                  <th className="hidden md:table-cell">Size</th>
                  <th className="!text-right">Price</th>
                  {th('chg', '1D')}
                  {th('mcap', 'Mcap', 'hidden md:table-cell')}
                  {th('pe', 'P/E', 'hidden xl:table-cell')}
                  {th('lt', 'Long term', 'hidden sm:table-cell')}
                  {th('st', 'Short term', 'hidden sm:table-cell')}
                  <th className="!text-right">Signals</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r, i) => {
                  const rep = curated.get(r.symbol);
                  const to = `/stocks/${market}/${encodeURIComponent(r.symbol)}`;
                  return (
                    <tr key={r.symbol} className="cursor-pointer transition-colors hover:bg-muted" onClick={() => nav(to)}>
                      <td className="num text-sub">{(cur - 1) * pageSize + i + 1}</td>
                      <td className="min-w-[10rem] !whitespace-normal">
                        <span className="flex items-center gap-2">
                          <Link to={to} className="tk hover:text-brand" onClick={(e) => e.stopPropagation()}>{r.symbol}</Link>
                          {rep && <Badge tone={ratingTone[rep.rating]} className="!h-5 !px-1.5 !text-[0.6875rem]">Report · {rep.rating}</Badge>}
                        </span>
                        <span className="block max-w-[16rem] truncate text-[0.78125rem] text-sub">{r.name}</span>
                      </td>
                      <td className="hidden max-w-[11rem] truncate text-fg2 lg:table-cell">{r.sector ?? '—'}</td>
                      <td className="hidden text-fg2 md:table-cell">{r.cap ?? '—'}</td>
                      <td className="num text-right">{r.price != null ? fmtPrice(r.price, market) : '—'}</td>
                      <td className={clsx('num text-right font-semibold', r.chg == null ? 'text-sub' : r.chg >= 0 ? 'text-up' : 'text-down')}>{r.chg == null ? '—' : pct(r.chg, 2)}</td>
                      <td className="num hidden text-right text-fg2 md:table-cell">{r.mcap != null ? fmtMcapRaw(r.mcap, market) : rep ? fmtMcap(rep.marketCap, market) : '—'}</td>
                      <td className="num hidden text-right xl:table-cell">{r.pe != null && r.pe > 0 ? r.pe.toFixed(1) : '—'}</td>
                      <td className="hidden text-right sm:table-cell"><Score v={r.lt} /></td>
                      <td className="hidden text-right sm:table-cell"><Score v={r.st} /></td>
                      <td className="text-right">
                        <span className="inline-flex justify-end gap-1">
                          {r.pk.map((h) => <Badge key={h} tone="up" className="!h-5 !px-1.5 !text-[0.6875rem]" >{horizonMeta[h].short}</Badge>)}
                          {!r.pk.length && r.setup && <span className="text-[0.75rem] text-sub">{r.setup}</span>}
                          {!r.pk.length && !r.setup && <span className="text-sub">—</span>}
                          <span onClick={(e) => e.stopPropagation()}><WatchButton id={`${market}:${r.symbol}`} className="!p-1" /></span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2.5 text-[0.8125rem] text-sub sm:px-5">
              <span className="num">{(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, filtered.length)} of {filtered.length.toLocaleString('en-IN')}</span>
              <span className="flex items-center gap-1">
                <button className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40 sm:h-8 sm:w-8" disabled={cur === 1} onClick={() => set('page', String(cur - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span className="num px-2 text-fg">{cur} / {pages}</span>
                <button className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40 sm:h-8 sm:w-8" disabled={cur === pages} onClick={() => set('page', String(cur + 1))} aria-label="Next page"><ChevronRight size={16} /></button>
              </span>
            </div>
          )}
        </div>
      )}
      <p className="mt-3 text-xs text-sub">
        Long-term and short-term scores are percentile ranks (100 = best in the market). <b>ST / LT / SW</b> mark high-conviction picks. “Report” stocks also have a full written analysis.
      </p>
    </div>
  );
}
