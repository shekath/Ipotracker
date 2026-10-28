import { useCallback, useEffect, useState } from 'react';
import type { Market } from '../types';

const KEY = 'ml-market';
const EVT = 'ml-market-change';

function read(): Market {
  try {
    return localStorage.getItem(KEY) === 'US' ? 'US' : 'IN';
  } catch {
    return 'IN';
  }
}

/** Selected market, shared across pages and remembered per browser. India is the default. */
export function useMarketPref(): [Market, (m: Market) => void] {
  const [m, setM] = useState<Market>(read);
  useEffect(() => {
    const sync = () => setM(read());
    window.addEventListener(EVT, sync);
    return () => window.removeEventListener(EVT, sync);
  }, []);
  const set = useCallback((next: Market) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* storage unavailable */
    }
    setM(next);
    window.dispatchEvent(new Event(EVT));
  }, []);
  return [m, set];
}
