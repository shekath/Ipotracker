import { useMemo } from 'react';
import { ipos as curated } from '../data';
import { useLiveIpos } from './live';
import { mergeIpos } from './ipoView';

export function useIpoViews() {
  const { feed, status } = useLiveIpos();
  const views = useMemo(() => mergeIpos(curated, feed?.ipos), [feed]);
  return { views, feed, status };
}
