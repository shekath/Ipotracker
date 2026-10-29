import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Search } from 'lucide-react';
import { stocks } from '../data';
import { useIpoViews } from '../lib/useIpoViews';
import { useIndexDefs } from '../lib/screener';
import { ipoStatus } from '../lib/scoring';
import { useResearch } from '../lib/research';
import { useMarketPref } from '../lib/marketPref';

interface Item {
  group: 'Stocks' | 'IPOs' | 'Indices';
  code: string;
  title: string;
  meta: string;
  to: string;
}

/** ⌘K / Ctrl+K search across researched stocks, IPOs and index screeners. */
export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { views } = useIpoViews();
  const defs = useIndexDefs();
  const [market] = useMarketPref();
  const { data: research } = useResearch(market);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const items = useMemo<Item[]>(
    () => [
      ...stocks.map((s) => ({ group: 'Stocks' as const, code: s.symbol, title: s.name, meta: `${s.market === 'IN' ? 'India' : 'US'} · ${s.sector}`, to: `/stocks/${s.market}/${encodeURIComponent(s.symbol)}` })),
      // The whole research universe for the selected market (researched stocks above take precedence).
      ...(research?.rows ?? []).filter((r) => !stocks.some((s) => s.market === market && s.symbol === r.symbol)).map((r) => ({ group: 'Stocks' as const, code: r.symbol, title: r.name, meta: `${market === 'IN' ? 'India' : 'US'}${r.sector ? ` · ${r.sector}` : ''}`, to: `/stocks/${market}/${encodeURIComponent(r.symbol)}` })),
      ...views.map((i) => ({ group: 'IPOs' as const, code: 'IPO', title: i.name, meta: `${i.type} · ${ipoStatus(i)}`, to: `/ipo/${i.id}` })),
      ...(defs ?? []).map((d) => ({ group: 'Indices' as const, code: d.exchange, title: d.name === 'All' ? `All ${d.market === 'IN' ? 'India' : 'US'} stocks` : d.name, meta: 'Index screener', to: `/screener?index=${d.id}` })),
    ],
    [views, defs, research, market],
  );

  const needle = q.trim().toLowerCase();
  const shown = items.filter((i) => !needle || `${i.title} ${i.code} ${i.meta}`.toLowerCase().includes(needle)).slice(0, needle ? 10 : 8);

  useEffect(() => {
    if (!open) return;
    setQ('');
    setSel(0);
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open]);

  if (!open) return null;

  const go = (i?: Item) => {
    if (!i) return;
    onClose();
    nav(i.to);
  };

  let last = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/45 px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="page-enter w-full max-w-[620px] overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.45)]">
        <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
          <Search size={17} className="text-sub" />
          <input
            ref={input}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSel((s) => Math.min(shown.length - 1, s + 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSel((s) => Math.max(0, s - 1));
              }
              if (e.key === 'Enter') go(shown[sel]);
            }}
            placeholder="Search a company, ticker, IPO or index"
            className="flex-1 bg-transparent text-base outline-none placeholder:text-sub"
            aria-controls="palette-results"
            autoComplete="off"
          />
          <kbd className="rounded-[5px] border border-line bg-muted px-1.5 py-1 font-mono text-[0.6875rem] text-fg2">esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[380px] overflow-auto p-1.5">
          {shown.map((i, k) => {
            const head = i.group !== last ? (last = i.group) : null;
            return (
              <li key={i.to} role="presentation">
                {head && <div className="px-2.5 pb-1 pt-2.5 text-[0.71875rem] font-semibold uppercase tracking-[0.04em] text-sub">{head}</div>}
                <button
                  role="option"
                  aria-selected={k === sel}
                  onMouseEnter={() => setSel(k)}
                  onClick={() => go(i)}
                  className={clsx('grid w-full grid-cols-[76px_1fr_auto] items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm', k === sel && 'bg-muted shadow-[inset_2px_0_0_rgb(var(--fg))]')}
                >
                  <span className="tk truncate text-[0.78125rem]">{i.code}</span>
                  <span className="truncate">{i.title}</span>
                  <span className="truncate text-[0.78125rem] text-sub">{i.meta}</span>
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="px-3 py-6 text-center text-sm text-sub">No matches for “{q}”.</li>}
        </ul>
        <div className="flex gap-4 border-t border-line px-4 py-2.5 text-xs text-sub">
          <span><kbd className="font-mono">↑ ↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> open</span>
          <span className="ml-auto hidden sm:inline">Tip: try a sector, like “bank”</span>
        </div>
      </div>
    </div>
  );
}
