import { useCallback, useEffect, useState } from 'react';

const KEY = 'ml-watchlist';
const EVT = 'ml-watchlist-change';

function read(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Per-browser watchlist keyed as "MARKET:SYMBOL". */
export function useWatchlist() {
  const [list, setList] = useState<string[]>(read);

  useEffect(() => {
    const sync = () => setList(read());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const toggle = useCallback((id: string) => {
    const cur = read();
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable */
    }
    setList(next);
    window.dispatchEvent(new Event(EVT));
  }, []);

  return { list, has: (id: string) => list.includes(id), toggle };
}
