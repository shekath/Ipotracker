import { NavLink, Link, Outlet, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import clsx from 'clsx';
import { BarChart3, LayoutDashboard, Monitor, Moon, Rocket, SlidersHorizontal, Star, Sun, Target } from 'lucide-react';
import { useTheme, type ThemePref } from '../lib/theme';

// `short` is shown on medium screens, `mobile` in the bottom tab bar.
const nav: { to: string; label: string; short?: string; mobile?: string; icon: typeof Rocket; end?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/picks', label: 'Picks', icon: Star },
  { to: '/stocks', label: 'Stocks', icon: BarChart3 },
  { to: '/screener', label: 'Screener', icon: SlidersHorizontal },
  { to: '/ipo', label: 'IPOs', icon: Rocket },
  { to: '/weekly-targets', label: 'Weekly Index Targets', short: 'Weekly Targets', mobile: 'Targets', icon: Target },
];

function ThemeSwitch() {
  const { pref, setPref } = useTheme();
  const opts: { v: ThemePref; icon: typeof Sun; label: string }[] = [
    { v: 'light', icon: Sun, label: 'Light' },
    { v: 'system', icon: Monitor, label: 'System' },
    { v: 'dark', icon: Moon, label: 'Dark' },
  ];
  return (
    <div className="inline-flex rounded-xl border border-line bg-muted/60 p-0.5" role="radiogroup" aria-label="Theme">
      {opts.map(({ v, icon: Icon, label }) => (
        <button
          key={v}
          role="radio"
          aria-checked={pref === v}
          aria-label={label}
          title={label}
          onClick={() => setPref(v)}
          className={clsx('rounded-lg p-1.5 transition-colors', pref === v ? 'bg-surface text-fg shadow-sm ring-1 ring-line' : 'text-sub hover:text-fg')}
        >
          <Icon size={15} />
        </button>
      ))}
    </div>
  );
}

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 font-bold tracking-tight">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white shadow-sm shadow-brand/30">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16l5-5 3.5 3.5L20 7" /></svg>
      </span>
      <span className="text-[17px]">Market<span className="text-brand">Lens</span></span>
    </Link>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  // Braces matter: newer browsers make scrollTo() return a Promise, and an effect
  // that returns anything but a cleanup function crashes React on navigation.
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex">
            {nav.map(({ to, label, short, end }) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium transition-colors lg:px-3.5', isActive ? 'bg-muted text-fg' : 'text-sub hover:text-fg')}>
                {short ? <><span className="xl:hidden">{short}</span><span className="hidden xl:inline">{label}</span></> : label}
              </NavLink>
            ))}
          </nav>
          <ThemeSwitch />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto max-w-7xl px-4 py-8 text-xs leading-relaxed text-sub sm:px-6 lg:px-8">
          <p className="max-w-4xl">
            <strong className="text-fg">Disclaimer:</strong> MarketLens is an educational research tool, not investment advice. MarketLens is not a SEBI-registered investment adviser or research analyst, nor a US-registered adviser. Prices, financials and targets come from a point-in-time research snapshot and may differ from live market data. Grey-market premium (GMP) figures are unofficial. Verify with exchange filings / RHPs and consult a registered adviser before investing.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} MarketLens</p>
        </div>
      </footer>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/90 backdrop-blur-xl md:hidden" aria-label="Primary">
        <div className="grid grid-cols-6">
          {nav.map(({ to, label, mobile, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => clsx('flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium', isActive ? 'text-brand' : 'text-sub')}>
              <Icon size={20} />
              {mobile ?? label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
