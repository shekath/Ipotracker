import { useEffect, useState } from 'react';
import { getJSON } from './api';
import type { IndexDef, ScreenerResult } from '../types';

let defsPromise: Promise<IndexDef[]> | undefined;

/** Index definitions (static file shared with the PHP backend). */
export function useIndexDefs() {
  const [defs, setDefs] = useState<IndexDef[]>();
  useEffect(() => {
    defsPromise ??= fetch('./data/indices.json')
      .then((r) => r.json())
      .then((d: { indices: IndexDef[] }) => d.indices);
    defsPromise.then(setDefs).catch(() => setDefs([]));
  }, []);
  return defs;
}

const cache = new Map<string, ScreenerResult>();
const POLL_MS = 120_000;

/** Live constituents + quotes. Falls back to the bundled member list when the API is unavailable. */
export function useScreener(def?: IndexDef) {
  const id = def?.id;
  const [state, setState] = useState<{ data?: ScreenerResult; offline?: boolean; loading: boolean }>({ loading: true });

  useEffect(() => {
    if (!def) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const fallback = (): ScreenerResult => ({
      id: def.id,
      asOf: 0,
      constituentsSource: 'Bundled fallback list',
      quoteSource: null,
      rows: (def.fallback ?? []).map(([symbol, name, industry]) => ({ symbol, name, industry, price: null })),
    });
    const load = async () => {
      try {
        const d = await getJSON<ScreenerResult>(`screener.php?index=${def.id}`, 45000);
        cache.set(def.id, d);
        if (alive) setState({ data: d, loading: false, offline: !d.quoteSource });
      } catch {
        if (alive) setState((s) => (s.data && s.data.id === def.id ? { ...s, loading: false } : { data: fallback(), loading: false, offline: true }));
      }
      if (alive && !document.hidden) timer = setTimeout(load, POLL_MS);
    };
    const cached = cache.get(def.id);
    setState(cached ? { data: cached, loading: false } : { loading: true });
    load();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return state;
}
