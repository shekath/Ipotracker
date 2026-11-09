import { useMemo } from 'react';
import { ipos as curated } from '../data';
import { useLiveIpos } from './live';
import { mergeIpos } from './ipoView';
import type { IpoView } from './ipoView';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The IPO list holds upcoming, open and closed issues, and listed ones only on their listing day:
 * an issue drops off the day after it lists. One with no listing date drops off 10 days after closing.
 */
export function isCurrentIpo(i: Pick<IpoView, 'closeDate' | 'listingDate'>, now = new Date()): boolean {
  const today = iso(now);
  if (i.listingDate) return i.listingDate >= today;
  if (!i.closeDate) return true;
  const stale = new Date(now);
  stale.setDate(stale.getDate() - 10);
  return i.closeDate >= iso(stale);
}

export function useIpoViews() {
  const { feed, status } = useLiveIpos();
  const views = useMemo(() => mergeIpos(curated, feed?.ipos).filter((i) => isCurrentIpo(i)), [feed]);
  return { views, feed, status };
}
