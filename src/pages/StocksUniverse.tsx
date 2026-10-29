import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, Star } from 'lucide-react';
import clsx from 'clsx';
import { stocks } from '../data';
import { Badge, EmptyState, Segmented } from '../components/ui';
import { WatchButton } from '../components/StockCard';
import { marketTabs } from '../components/Flag';
import { fmtPrice, pct } from '../lib/format';
import { ratingTone } from '../lib/scoring';
import { useWatchlist } from '../lib/watchlist';
import { useMarketPref } from '../lib/marketPref';
import { horizonMeta, useResearch, type Horizon, type ResearchRow } from '../lib/research';
import { RegimeStrip } from './Picks';
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
  { value: 'reports', label: 'Has an analyst report' },
  { value: 'watch', label: 'My watchlist' },
];
const PAGE = 25;

const fmtMcapRaw = (v: number | null, m: Market) => {
  if (v == null) return '—';
  if (m === 'IN') {
    const cr = v / 1e7;
    return cr >= 1e5 ? `₹${(cr / 1e5).toFixed(2)} L Cr` : `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
  }
  return v >= 1e12 ? `$${(v / 1e12).toFixed(2)} T` : `$${(v / 1e9).toFixed(1)} B`;
};

/** Switch between the full-market research and the written analyst reports. */
export function CoverageSwitch({ value }: { value: 'all' | 'reports' }) {
  const [params, setParams] = useSearchParams();
  return (
    <Segmented
      value={value}
      onChange={(v) => {
        const next = new URLSearchParams();
        if (v === 'reports') next.set('coverage', 'reports');
        if (params.get('sector')) next.set('sector', params.get('sector')!);
        setParams(next, { replace: true });
      }}
      options={[{ value: 'all', label: 'Full market' }, { value: 'reports', label: 'Analyst reports' }]}
    />
  );
}

function Score({ v }: { v: number | null }) {
  if (v == null) return <span className="text-sub">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted"><i className={clsx('block h-full rounded-full', v >= 80 ? 'bg-up' : v >= 50 ? 'bg-brand' : 'bg-sub/50')} style={{ width: `${v}%` }} /></span>
      <span className="num w-6 text-right">{v}</span>
    </span>
  );
}

/** Every stock in the research universe, with sector, index, size and signal filters. */
export default function UniverseView() {
  const [params, setParams] = useSearchParams();
  const [market, setMarket] = useMarketPref();
  const nav = useNavigate();
  const { data } = useResearch(market);
  const { list: watch } = useWatchlist();
  const get = (k: string, d = '') => params.get(k) ?? d;
  const q = get('q');
  const sector = get('sector', 'All');
  const index = get('index', 'All');
  const cap = get('cap', 'All');
  const signal = get('signal', 'all') as Signal;
  const sort = (get('sort', 'lt') || 'lt') as SortKey;
  const dir = get('dir') === 'asc' ? 1 : -1;
  const page = Math.max(1, Number(get('page', '1')) || 1);

  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(params);
    if (v == null || v === '' || v === 'All' || v === 'all') next.delete(k);
    else next.set(k, v);
    if (k !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  const curated = useMemo(() => new Map(stocks.filter((s) => s.market === market).map((s) => [s.symbol, s])), [market]);
  const rows = data?.rows ?? [];
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
      if (av == null) return 1;
      if (bv == null) return -1;
      return (typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number)) * dir;
    });
  }, [rows, q, sector, index, cap, signal, sort, dir, curated, watch, market]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const sortBtn = (k: SortKey, label: string) => (
    <button
      className={clsx('inline-flex items-center gap-1 uppercase tracking-wider hover:text-fg', sort === k && 'text-fg')}
      onClick={() => {
        const next = new URLSearchParams(params);
        const nd = sort === k ? (dir === -1 ? 'asc' : null) : k === 'name' || k === 'pe' ? 'asc' : null;
        next.set('sort', k);
        if (nd) next.set('dir', nd);
        else next.delete('dir');
        next.delete('page');
        setParams(next, { replace: true });
      }}
    >
      {label}
      {sort === k && (dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Stock research</h1>
          <p className="mt-1 max-w-2xl text-sm text-sub">{data ? `${data.universe.toLocaleString('en-IN')} ${market === 'IN' ? 'Indian' : 'US'} stocks scored on fundamentals and technicals. Filter by sector, index or size, and open any stock for its full research.` : 'Loading the full-market research…'}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CoverageSwitch value="all" />
          <Segmented value={market} onChange={(m) => { setMarket(m); setParams({}, { replace: true }); }} options={marketTabs} />
        </div>
      </div>

      {data && <div className="mb-4"><RegimeStrip data={data} /></div>}

      <div className="card mb-6 space-y-4 p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row">
          <label className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sub" />
            <input className="input pl-10" placeholder="Search by name or symbol…" value={q} onChange={(e) => set('q', e.target.value)} aria-label="Search stocks" />
          </label>
          <div className="grid grid-cols-2 gap-3 md:flex">
            <select className="input md:w-52" value={signal} onChange={(e) => set('signal', e.target.value)} aria-label="Signal">{signals.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
            <select className="input md:w-44" value={index} onChange={(e) => set('index', e.target.value)} aria-label="Index" disabled={!indices.length}><option value="All">All indices</option>{indices.map((s) => <option key={s}>{s}</option>)}</select>
          </div>
        </div>
        <div className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 no-scrollbar">
          {['All', ...caps].map((c) => (
            <button key={c} onClick={() => set('cap', c)} className={clsx('chip', cap === c && 'chip-active')}>{c === 'All' ? 'All sizes' : `${c} cap`}</button>
          ))}
          <span className="mx-1 h-5 w-px shrink-0 bg-line" />
          {['All', ...sectors].map((s) => (
            <button key={s} onClick={() => set('sector', s)} className={clsx('chip', sector === s && 'chip-active')}>{s === 'All' ? 'All sectors' : s}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-sm text-sub">
          <span><span className="font-semibold text-fg">{filtered.length.toLocaleString('en-IN')}</span> results{data?.building ? ` · research still building (${data.coverage.history}/${data.universe})` : ''}</span>
          <Link to="/picks" className="btn bg-fg text-bg hover:opacity-90"><Star size={15} /> High-conviction picks</Link>
        </div>
      </div>

      {!data ? (
        <div className="card h-96 animate-pulse" />
      ) : !filtered.length ? (
        <EmptyState title="No stocks match" body="Try clearing a filter or searching for something else." action={<button className="btn-ghost border border-line" onClick={() => setParams({})}>Reset filters</button>} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>{sortBtn('name', 'Company')}</th>
                <th className="hidden lg:table-cell">Sector</th>
                <th className="hidden md:table-cell">Size</th>
                <th className="!text-right">Price</th>
                <th className="!text-right">{sortBtn('chg', 'Day')}</th>
                <th className="hidden !text-right md:table-cell">{sortBtn('mcap', 'Mcap')}</th>
                <th className="hidden !text-right xl:table-cell">{sortBtn('pe', 'P/E')}</th>
                <th className="hidden !text-right sm:table-cell">{sortBtn('lt', 'Long term')}</th>
                <th className="hidden !text-right sm:table-cell">{sortBtn('st', 'Short term')}</th>
                <th className="!text-right">Signals</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => {
                const rep = curated.get(r.symbol);
                const to = `/stocks/${market}/${encodeURIComponent(r.symbol)}`;
                return (
                  <tr key={r.symbol} className="cursor-pointer transition-colors hover:bg-muted/50" onClick={() => nav(to)}>
                    <td className="num text-xs text-sub">{(cur - 1) * PAGE + i + 1}</td>
                    <td>
                      <Link to={to} className="font-semibold hover:text-brand" onClick={(e) => e.stopPropagation()}>{r.symbol}</Link>
                      {rep && <Badge tone={ratingTone[rep.rating]} className="ml-2 !px-2 !text-[10px]">Report · {rep.rating}</Badge>}
                      <span className="block max-w-[14rem] truncate text-xs text-sub">{r.name}</span>
                    </td>
                    <td className="hidden max-w-[11rem] truncate text-sub lg:table-cell">{r.sector ?? '—'}</td>
                    <td className="hidden text-sub md:table-cell">{r.cap ?? '—'}</td>
                    <td className="num text-right font-medium">{r.price != null ? fmtPrice(r.price, market) : '—'}</td>
                    <td className={clsx('num text-right font-semibold', r.chg == null ? 'text-sub' : r.chg >= 0 ? 'text-up' : 'text-down')}>{r.chg == null ? '—' : pct(r.chg, 2)}</td>
                    <td className="num hidden text-right text-sub md:table-cell">{fmtMcapRaw(r.mcap, market)}</td>
                    <td className="num hidden text-right xl:table-cell">{r.pe != null && r.pe > 0 ? r.pe.toFixed(1) : '—'}</td>
                    <td className="hidden text-right sm:table-cell"><Score v={r.lt} /></td>
                    <td className="hidden text-right sm:table-cell"><Score v={r.st} /></td>
                    <td className="text-right">
                      <span className="inline-flex items-center justify-end gap-1">
                        {r.pk.map((h) => <Badge key={h} tone="up" className="!px-2 !text-[10px]">{horizonMeta[h].short}</Badge>)}
                        {!r.pk.length && r.setup && <span className="text-xs text-sub">{r.setup}</span>}
                        {!r.pk.length && !r.setup && <span className="text-sub">—</span>}
                        <span onClick={(e) => e.stopPropagation()}><WatchButton id={`${market}:${r.symbol}`} /></span>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-sub">
              <span className="num">{(cur - 1) * PAGE + 1}–{Math.min(cur * PAGE, filtered.length)} of {filtered.length.toLocaleString('en-IN')}</span>
              <span className="flex items-center gap-1">
                <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40" disabled={cur === 1} onClick={() => set('page', String(cur - 1))} aria-label="Previous page"><ChevronLeft size={16} /></button>
                <span className="num px-2 text-fg">{cur} / {pages}</span>
                <button className="inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-40" disabled={cur === pages} onClick={() => set('page', String(cur + 1))} aria-label="Next page"><ChevronRight size={16} /></button>
              </span>
            </div>
          )}
        </div>
      )}
      <p className="mt-4 text-xs text-sub">Long-term and short-term scores are percentile ranks (100 = best in the market). <b>ST / LT / SW</b> mark high-conviction picks. “Report” stocks also have a full written analysis.</p>
    </div>
  );
}
