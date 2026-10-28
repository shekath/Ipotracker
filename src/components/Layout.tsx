import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { Fragment, useEffect, useState } from 'react';
import clsx from 'clsx';
import { BarChart3, LineChart, Moon, Rocket, Search, SlidersHorizontal, Sun, Target } from 'lucide-react';
import { useTheme } from '../lib/theme';
import { useMarketPref } from '../lib/marketPref';
import { useQuotes } from '../lib/live';
import { TAPE, HEADLINE, sessionInfo } from '../lib/indices';
import { pct } from '../lib/format';
import { marketTabs } from './Flag';
import CommandPalette from './CommandPalette';

// `mobile` is the shorter label used in the bottom tab bar.
const nav: { to: string; label: string; mobile?: string; icon: typeof Rocket; end?: boolean }[] = [
  { to: '/', label: 'Overview', icon: LineChart, end: true },
  { to: '/stocks', label: 'Stocks', icon: BarChart3 },
  { to: '/screener', label: 'Screener', icon: SlidersHorizontal },
  { to: '/ipo', label: 'IPO desk', icon: Rocket },
  { to: '/weekly-targets', label: 'Weekly targets', mobile: 'Targets', icon: Target },
];

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 whitespace-nowrap text-[16.5px] font-bold tracking-[-0.02em]">
      <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] bg-fg">
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" className="stroke-surface" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 17l6-6 4 4 8-8" /></svg>
      </span>
      MarketLens
    </Link>
  );
}

function ThemeButton() {
  const { isDark, setPref } = useTheme();
  return (
    <button onClick={() => setPref(isDark ? 'light' : 'dark')} className="flex h-9 w-9 items-center justify-center rounded-[9px] border border-line text-fg2 transition-colors hover:border-line2 hover:text-fg" aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Light mode' : 'Dark mode'}>
      {isDark ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}

function MarketSwitch() {
  const [market, setMarket] = useMarketPref();
  return (
    <div className="seg" role="group" aria-label="Market">
      {marketTabs.map((t) => (
        <button key={t.value} aria-pressed={market === t.value} onClick={() => setMarket(t.value)} className={clsx('seg-btn', market === t.value && 'seg-on')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Live index strip under the header. Hidden items have no quote yet. */
function Tape() {
  const [market] = useMarketPref();
  const items = TAPE[market];
  const { quotes } = useQuotes(items.map((i) => i.id));
  const head = quotes[HEADLINE[market].id];
  const open = head ? !!head.marketOpen && !head.stale : sessionInfo(market).open;
  const live = items.filter((i) => quotes[i.id]);
  return (
    <div className="border-t border-line bg-surface">
      <div className="no-scrollbar mx-auto flex h-[34px] max-w-[1400px] items-center gap-6 overflow-x-auto whitespace-nowrap px-4 font-mono text-[13px] sm:px-7">
        <span className={clsx('inline-flex items-center gap-2 font-semibold', open ? 'text-up' : 'text-sub')}>
          <span className={clsx('h-[7px] w-[7px] rounded-full bg-current', open && 'animate-pulse shadow-[0_0_0_3px_rgb(var(--up)/0.15)]')} />
          {open ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </span>
        {live.map((i) => {
          const q = quotes[i.id];
          return (
            <Fragment key={i.id}>
              <span className="h-3.5 w-px shrink-0 bg-line" />
              <span>
                <b className="mr-2 font-medium text-fg2">{i.label}</b>
                {i.unit}{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 })}{i.suffix}{' '}
                <span className={q.changePct >= 0 ? 'text-up' : 'text-down'}>{pct(q.changePct, 2)}</span>
              </span>
            </Fragment>
          );
        })}
        {!live.length && <span className="text-sub">Index prices appear here once the live feed connects.</span>}
      </div>
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const [palette, setPalette] = useState(false);
  // Braces matter: newer browsers make scrollTo() return a Promise, and an effect
  // that returns anything but a cleanup function crashes React on navigation.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4 sm:h-[60px] sm:gap-7 sm:px-7">
          <Logo />
          <nav className="hidden h-full items-stretch gap-1 md:flex" aria-label="Primary">
            {nav.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('relative flex items-center px-3 text-[14.5px] font-medium transition-colors', isActive ? 'text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-t after:bg-fg' : 'text-sub hover:text-fg')}>
                {label}
              </NavLink>
            ))}
          </nav>
          <span className="flex-1" />
          <button onClick={() => setPalette(true)} className="flex h-9 w-9 items-center justify-center gap-2.5 rounded-[9px] border border-line bg-muted text-sm text-sub transition-colors hover:border-line2 lg:w-[280px] lg:justify-start lg:px-3" aria-label="Search stocks, IPOs and indices">
            <Search size={15} />
            <span className="hidden lg:inline">Search stocks, IPOs…</span>
            <kbd className="ml-auto hidden rounded-[5px] border border-line bg-surface px-1.5 py-1 font-mono text-[11px] text-fg2 lg:inline">⌘K</kbd>
          </button>
          <div className="hidden sm:block"><MarketSwitch /></div>
          <ThemeButton />
        </div>
        <Tape />
      </header>

      <main className="page-enter mx-auto max-w-[1400px] px-4 py-5 sm:px-7 sm:py-6" key={pathname}>
        <div className="mb-4 sm:hidden"><MarketSwitch /></div>
        <Outlet />
      </main>

      <footer className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1400px] px-4 py-8 text-xs leading-relaxed text-sub sm:px-7">
          <p className="max-w-4xl">
            <strong className="text-fg">Disclaimer:</strong> MarketLens is an educational research tool, not investment advice. MarketLens is not a SEBI-registered investment adviser or research analyst, nor a US-registered adviser. Prices, financials and targets come from a point-in-time research snapshot and may differ from live market data. Grey-market premium (GMP) figures are unofficial. Verify with exchange filings / RHPs and consult a registered adviser before investing.
          </p>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
            <span>© {new Date().getFullYear()} MarketLens</span>
          </p>
        </div>
      </footer>

      <nav className="fixed inset-x-3 bottom-3 z-40 grid h-[62px] grid-cols-5 rounded-2xl bg-fg p-1.5 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.5)] md:hidden" aria-label="Primary mobile">
        {nav.map(({ to, label, mobile, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('flex flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium', isActive ? 'bg-surface/15 text-surface' : 'text-surface/60')}>
            <Icon size={19} />
            {mobile ?? (label === 'IPO desk' ? 'IPOs' : label)}
          </NavLink>
        ))}
      </nav>

      <CommandPalette open={palette} onClose={() => setPalette(false)} />
    </div>
  );
}
