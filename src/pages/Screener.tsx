import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ExternalLink, Info, Search } from 'lucide-react';
import clsx from 'clsx';
import { stocks } from '../data';
import { Badge, EmptyState } from '../components/ui';
import { timeAgo } from '../components/live';
import { useIndexDefs, useScreener } from '../lib/screener';
import { useMarketPref } from '../lib/marketPref';
import { pct } from '../lib/format';
import { ratingTone } from '../lib/scoring';
import type { Market, ScreenerRow } from '../types';

type SortKey = 'name' | 'price' | 'changePct' | 'mcap' | 'pe' | 'pb' | 'divYield' | 'fromHigh';
type Preset = 'all' | 'gainers' | 'losers' | 'nearHigh' | 'nearLow' | 'value' | 'dividend' | 'covered';

const presets: { value: Preset; label: string; test: (r: ScreenerRow & { fromHigh?: number; fromLow?: number }) => boolean }[] = [
  { value: 'all', label: 'All stocks', test: () => true },
  { value: 'gainers', label: 'Top gainers', test: (r) => (r.changePct ?? 0) > 0 },
  { value: 'losers', label: 'Top losers', test: (r) => (r.changePct ?? 0) < 0 },
  { value: 'nearHigh', label: 'Near 52W high (≤5%)', test: (r) => r.fromHigh != null && r.fromHigh >= -5 },
  { value: 'nearLow', label: 'Near 52W low (≤10%)', test: (r) => r.fromLow != null && r.fromLow <= 10 },
  { value: 'value', label: 'Value (P/E < 20)', test: (r) => r.pe != null && r.pe > 0 && r.pe < 20 },
  { value: 'dividend', label: 'Dividend yield > 2%', test: (r) => (r.divYield ?? 0) > 2 },
  { value: 'covered', label: 'MarketLens research', test: () => true },
];

const fmtMcapRaw = (v: number | null | undefined, m: Market) => {
  if (v == null) return '—';
  if (m === 'IN') {
    const cr = v / 1e7;
    return cr >= 1e5 ? `₹${(cr / 1e5).toFixed(2)} L Cr` : `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
  }
  return v >= 1e12 ? `$${(v / 1e12).toFixed(2)} T` : `$${(v / 1e9).toFixed(1)} B`;
};
const fmtP = (v: number | null | undefined, m: Market) =>
  v == null ? '—' : `${m === 'IN' ? '₹' : '$'}${v.toLocaleString(m === 'IN' ? 'en-IN' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fx = (v: number | null | undefined, d = 1) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));

const PAGE_SIZES = [10, 25, 50, 100];
const PAGE_SIZE_KEY = 'ml-page-size';
function readPageSize() {
  try {
    const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(n) ? n : 25;
  } catch {
    return 25;
  }
}

/** Page numbers to show: first, last, current ±1, with gaps marked as null. */
function pageList(page: number, count: number): (number | null)[] {
  const set = new Set([1, count, page - 1, page, page + 1].filter((n) => n >= 1 && n <= count));
  const sorted = [...set].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) out.push(null);
    out.push(n);
  });
  return out;
}

function Pagination({ page, pageCount, pageSize, total, offset, shown, onPage, onPageSize }: { page: number; pageCount: number; pageSize: number; total: number; offset: number; shown: number; onPage: (n: number) => void; onPageSize: (n: number) => void }) {
  const btn = 'inline-flex h-10 min-w-10 sm:h-8 sm:min-w-8 items-center justify-center rounded-[7px] px-2 font-mono text-[0.8125rem] font-medium transition-colors disabled:pointer-events-none disabled:opacity-40';
  return (
    <div className="flex flex-col gap-3 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-center gap-3 text-sm text-sub">
        <label className="flex items-center gap-2">
          Rows
 <select className="h-10 rounded-lg border border-field bg-surface px-2 text-base font-medium sm:h-8 sm:text-sm text-fg focus:outline-none focus:ring-2 focus:ring-brand/40" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} aria-label="Rows per page">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="num">{total ? `${offset + 1}–${offset + shown}` : 0} of {total}</span>
      </div>
      {pageCount > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button className={clsx(btn, 'text-sub hover:bg-muted hover:text-fg')} onClick={() => onPage(1)} disabled={page === 1} aria-label="First page"><ChevronsLeft size={16} /></button>
          <button className={clsx(btn, 'text-sub hover:bg-muted hover:text-fg')} onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page"><ChevronLeft size={16} /></button>
          {pageList(page, pageCount).map((n, i) =>
            n == null ? (
              <span key={`gap-${i}`} className="px-1 text-sub">…</span>
            ) : (
              <button key={n} className={clsx(btn, 'num', n === page ? 'bg-fg text-bg' : 'text-sub hover:bg-muted hover:text-fg')} onClick={() => onPage(n)} aria-current={n === page ? 'page' : undefined}>{n}</button>
            ),
          )}
          <button className={clsx(btn, 'text-sub hover:bg-muted hover:text-fg')} onClick={() => onPage(page + 1)} disabled={page === pageCount} aria-label="Next page"><ChevronRight size={16} /></button>
          <button className={clsx(btn, 'text-sub hover:bg-muted hover:text-fg')} onClick={() => onPage(pageCount)} disabled={page === pageCount} aria-label="Last page"><ChevronsRight size={16} /></button>
        </nav>
      )}
    </div>
  );
}

export default function Screener() {
  const [market] = useMarketPref();
  const [params, setParams] = useSearchParams();
  const defs = useIndexDefs();
  const list = (defs ?? []).filter((d) => d.market === market);
  const def = list.find((d) => d.id === params.get('index')) ?? list[0];
  const { data, loading, offline } = useScreener(def);

  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('All');
  const [preset, setPreset] = useState<Preset>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'mcap', dir: -1 });
  const [pageSize, setPageSizeState] = useState<number>(readPageSize);
  const [page, setPage] = useState(1);
  const setPageSize = (n: number) => {
    setPageSizeState(n);
    setPage(1);
    try {
      localStorage.setItem(PAGE_SIZE_KEY, String(n));
    } catch {
      /* storage unavailable */
    }
  };

  const pick = (id: string) => {
    setParams({ index: id }, { replace: true });
    setIndustry('All');
  };
  // The header's market switch changes the list; reset filters that belong to the old market.
  useEffect(() => {
    setIndustry('All');
    setPreset('all');
  }, [market]);

  const covered = useMemo(() => new Map(stocks.map((s) => [`${s.market}:${s.symbol}`, s])), []);

  const enriched = useMemo(
    () =>
      (data?.rows ?? []).map((r) => ({
        ...r,
        fromHigh: r.price != null && r.high52 ? ((r.price - r.high52) / r.high52) * 100 : undefined,
        fromLow: r.price != null && r.low52 ? ((r.price - r.low52) / r.low52) * 100 : undefined,
        research: covered.get(`${market}:${r.symbol}`),
      })),
    [data, covered, market],
  );

  const industries = useMemo(() => ['All', ...Array.from(new Set(enriched.map((r) => r.industry).filter(Boolean) as string[])).sort()], [enriched]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const test = presets.find((p) => p.value === preset)!.test;
    const r = enriched.filter(
      (x) =>
        (industry === 'All' || x.industry === industry) &&
        (preset !== 'covered' || x.research) &&
        test(x) &&
        (!needle || x.symbol.toLowerCase().includes(needle) || x.name.toLowerCase().includes(needle)),
    );
    const key = preset === 'gainers' ? { key: 'changePct' as SortKey, dir: -1 } : preset === 'losers' ? { key: 'changePct' as SortKey, dir: 1 } : sort;
    return r.sort((a, b) => {
      if (key.key === 'name') return a.name.localeCompare(b.name) * key.dir;
      const av = a[key.key as keyof typeof a] as number | null | undefined;
      const bv = b[key.key as keyof typeof b] as number | null | undefined;
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // missing values always last
      if (bv == null) return -1;
      return (av - bv) * key.dir;
    });
  }, [enriched, industry, preset, q, sort]);

  // Back to page 1 whenever the list itself changes.
  useEffect(() => {
    setPage(1);
  }, [def?.id, q, industry, preset, sort]);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(page, pageCount);
  const offset = (current - 1) * pageSize;
  const pageRows = rows.slice(offset, offset + pageSize);

  const priced = enriched.filter((r) => r.changePct != null);
  const adv = priced.filter((r) => (r.changePct ?? 0) > 0).length;
  const dec = priced.filter((r) => (r.changePct ?? 0) < 0).length;
  const unch = priced.length - adv - dec;
  const avg = priced.length ? priced.reduce((a, r) => a + (r.changePct ?? 0), 0) / priced.length : undefined;
  const top = [...priced].sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));

  const sortBtn = (key: SortKey, label: string) => (
    <button className={clsx('inline-flex min-h-7 items-center gap-1 hover:text-fg', sort.key === key && 'text-fg')} onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : key === 'name' ? 1 : -1 }))}>
      {label}
      {sort.key === key && (sort.dir === 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
    </button>
  );
  const th = (key: SortKey, label: string) => <th className="!text-right">{sortBtn(key, label)}</th>;

  const extLink = (sym: string) => (market === 'IN' ? `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(sym)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(sym.replace('.', '-'))}`);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.025em]">Index screener</h1>
          <p className="mt-1 text-sm text-sub">Every member of the major indices with live price, valuation and 52-week position. Click a researched stock for its full analysis.</p>
        </div>
      </div>

      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:flex-wrap sm:px-0">
        {!defs && Array.from({ length: 6 }).map((_, i) => <span key={i} className="chip w-28 animate-pulse bg-muted" />)}
        {list.map((d) => (
          <button key={d.id} onClick={() => pick(d.id)} aria-pressed={def?.id === d.id} className={clsx('chip', def?.id === d.id && 'chip-active')}>{d.name}</button>
        ))}
      </div>

      {def && (
        <div className="card card-pad mb-4">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold">{def.name}</h2>
                <Badge tone="neutral">{def.exchange}</Badge>
                {data && <Badge tone="neutral">{data.rows.length} stocks</Badge>}
              </div>
              <p className="mt-1 text-sm text-sub">{def.description}</p>
              <p className="mt-2 text-xs text-sub">
                Members: {data?.constituentsSource ?? '…'}
                {data?.quoteSource && <> · Prices: {data.quoteSource} · updated {timeAgo(data.asOf)}</>}
              </p>
            </div>
            {priced.length > 0 && (
              <div className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:w-[34rem]">
                <div>
                  <div className="label">Breadth</div>
                  <div className="num mt-1 text-sm font-semibold"><span className="text-up">{adv}▲</span> <span className="text-down">{dec}▼</span>{unch > 0 && <span className="text-sub"> {unch}–</span>}</div>
                  <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="bg-up" style={{ width: `${(adv / priced.length) * 100}%` }} />
                    <div className="bg-down" style={{ width: `${(dec / priced.length) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="label">Avg change</div>
                  <div className={clsx('num mt-1 text-sm font-semibold', (avg ?? 0) >= 0 ? 'text-up' : 'text-down')}>{avg != null ? pct(avg, 2) : '—'}</div>
                </div>
                <div className="min-w-0">
                  <div className="label">Top gainer</div>
                  <div className="mt-1 truncate text-sm font-semibold">{top[0]?.symbol} <span className="num text-up">{pct(top[0]?.changePct ?? 0, 1)}</span></div>
                </div>
                <div className="min-w-0">
                  <div className="label">Top loser</div>
                  <div className="mt-1 truncate text-sm font-semibold">{top[top.length - 1]?.symbol} <span className="num text-down">{pct(top[top.length - 1]?.changePct ?? 0, 1)}</span></div>
                </div>
              </div>
            )}
          </div>
          {offline && (
            <div className="mt-4 flex gap-2 rounded-xl bg-warn/10 p-3 text-xs leading-relaxed text-warn">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>Live prices need the site’s PHP data API (available on Hostinger, not on static hosting). Showing the bundled member list{def.fallbackNote ? ` — ${def.fallbackNote}` : ''}.</span>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2.5 md:flex-row">
        <label className="relative flex-1">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sub" />
          <input className="input pl-10" placeholder="Search company or symbol…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search constituents" />
        </label>
        <div className="grid grid-cols-2 gap-3 md:flex">
          <select className="input md:w-52" value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Screen">
            {presets.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="input md:w-56" value={industry} onChange={(e) => setIndustry(e.target.value)} aria-label="Industry">
            {industries.map((i) => <option key={i} value={i}>{i === 'All' ? 'All industries' : i}</option>)}
          </select>
        </div>
      </div>

      {loading && !data ? (
        <div className="card h-96 animate-pulse" />
      ) : def && data && data.rows.length === 0 ? (
        <EmptyState title="Member list unavailable" body="This index’s constituents load live from NSE Indices, which is unreachable right now. Try again later or pick another index." />
      ) : rows.length === 0 ? (
        <EmptyState title="No stocks match" body="Try a different screen or industry." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="sticky left-0 z-10">{sortBtn('name', 'Company')}</th>
                <th className="hidden md:table-cell">Industry</th>
                {th('price', 'Price')}
                {th('changePct', 'Day')}
                {th('mcap', 'Mcap')}
                {th('pe', 'P/E')}
                {th('pb', 'P/B')}
                {th('divYield', 'Div %')}
                {th('fromHigh', '52W range')}
                <th className="!text-right">Our view</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r, i) => {
                const pos = r.price != null && r.high52 && r.low52 && r.high52 > r.low52 ? ((r.price - r.low52) / (r.high52 - r.low52)) * 100 : undefined;
                return (
                  <tr key={r.symbol} className="group transition-colors hover:bg-muted">
                    <td className="sticky left-0 z-10 bg-surface transition-colors group-hover:bg-muted">
                      <div className="flex max-w-[15rem] items-center gap-2 sm:max-w-[20rem]">
                        <span className="num w-7 shrink-0 text-right text-xs text-sub">{offset + i + 1}</span>
                        <div className="min-w-0">
                          {r.research ? (
                            <Link to={`/stocks/${market}/${encodeURIComponent(r.symbol)}`} className="tk block hover:text-brand">{r.symbol}</Link>
                          ) : (
                            <a href={extLink(r.symbol)} target="_blank" rel="noreferrer noopener" className="tk inline-flex items-center gap-1 hover:text-brand">{r.symbol}<ExternalLink size={11} className="text-sub opacity-0 group-hover:opacity-100" /></a>
                          )}
                          <span className="block truncate text-xs text-sub">{r.name}</span>
                        </div>
                      </div>
                    </td>
                    <td className="hidden max-w-[11rem] truncate text-sub md:table-cell">{r.industry ?? '—'}</td>
                    <td className="num text-right font-medium">{fmtP(r.price, market)}</td>
                    <td className={clsx('num text-right font-semibold', r.changePct == null ? 'text-sub' : r.changePct >= 0 ? 'text-up' : 'text-down')}>{r.changePct == null ? '—' : pct(r.changePct, 2)}</td>
                    <td className="num text-right text-sub">{fmtMcapRaw(r.mcap, market)}</td>
                    <td className="num text-right">{r.pe != null && r.pe > 0 ? fx(r.pe) : '—'}</td>
                    <td className="num text-right">{fx(r.pb)}</td>
                    <td className="num text-right">{r.divYield != null ? fx(r.divYield, 2) : '—'}</td>
                    <td className="text-right">
                      {pos != null ? (
                        <div className="ml-auto w-28">
 <div className="relative h-1 rounded-full bg-line">
                            <span className="absolute -top-1 h-3 w-[3px] -translate-x-1/2 rounded-sm bg-fg" style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} />
                          </div>
                          <div className="num mt-1 text-[0.6875rem] text-sub">{fx(r.fromHigh, 1)}% from high</div>
                        </div>
                      ) : (
                        <span className="text-sub">—</span>
                      )}
                    </td>
                    <td className="text-right">{r.research ? <Link to={`/stocks/${market}/${encodeURIComponent(r.symbol)}`}><Badge tone={ratingTone[r.research.rating]}>{r.research.rating}</Badge></Link> : <span className="text-[0.78125rem] text-sub">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={current} pageCount={pageCount} pageSize={pageSize} total={rows.length} offset={offset} shown={pageRows.length} onPage={(n) => { setPage(n); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onPageSize={setPageSize} />
        </div>
      )}
      <p className="mt-4 text-xs text-sub">Stocks with a rating in the “Our view” column have a full MarketLens analysis with targets. Others link to the exchange quote page. Valuation data from Yahoo Finance; P/E shown only when earnings are positive.</p>
    </div>
  );
}
