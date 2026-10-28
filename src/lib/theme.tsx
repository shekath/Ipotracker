import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type ThemePref = 'light' | 'dark' | 'system';

interface ThemeCtx {
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
  isDark: boolean;
}

const Ctx = createContext<ThemeCtx | null>(null);
const KEY = 'ml-theme';

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* storage unavailable */
  }
  return 'system';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(read);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const isDark = pref === 'dark' || (pref === 'system' && systemDark);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
  }, [isDark]);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      /* storage unavailable */
    }
  };

  return <Ctx.Provider value={{ pref, setPref, isDark }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTheme outside ThemeProvider');
  return c;
}

/** Concrete colours for SVG charts (CSS variables are not reliable in SVG attributes). */
export function useChartColors() {
  const { isDark } = useTheme();
  return isDark
    ? { brand: '#34d399', brandSoft: '#34d39955', alt: '#818cf8', altSoft: '#818cf855', up: '#34d399', down: '#f87171', warn: '#fbbf24', grid: '#262b36', sub: '#919bac', fg: '#eceff4', surface: '#11141b', series: ['#34d399', '#818cf8', '#fbbf24', '#f472b6', '#38bdf8'] }
    : { brand: '#10b981', brandSoft: '#10b98155', alt: '#6366f1', altSoft: '#6366f155', up: '#059669', down: '#dc2626', warn: '#d97706', grid: '#e4e7ec', sub: '#647083', fg: '#0f172a', surface: '#ffffff', series: ['#10b981', '#6366f1', '#f59e0b', '#ec4899', '#0ea5e9'] };
}
