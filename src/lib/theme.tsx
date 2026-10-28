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
    ? { brand: '#f3f5f8', brandSoft: '#f3f5f855', alt: '#7d90ff', altSoft: '#7d90ff55', up: '#3fd18a', down: '#ff6b7d', warn: '#f5b84a', grid: '#222935', sub: '#8d97a7', fg: '#f3f5f8', surface: '#10141b', series: ['#f3f5f8', '#7d90ff', '#3fd18a', '#f5b84a', '#8d97a7'] }
    : { brand: '#0a0f1a', brandSoft: '#0a0f1a40', alt: '#2f4bff', altSoft: '#2f4bff55', up: '#047a48', down: '#c4122f', warn: '#a15c00', grid: '#e1e5eb', sub: '#5f6b7c', fg: '#0a0f1a', surface: '#ffffff', series: ['#0a0f1a', '#2f4bff', '#9aa8ff', '#047a48', '#a15c00'] };
}
