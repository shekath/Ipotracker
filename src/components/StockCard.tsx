import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import clsx from 'clsx';
import type { LiveStock, FeedStatus } from '../lib/live';
import { ChangeTag, LiveDot } from './live';
import { Badge, ScoreRing } from './ui';
import { change, fmtMcap, fmtPrice, pct } from '../lib/format';
import { overallScore, ratingTone } from '../lib/scoring';
import { useWatchlist } from '../lib/watchlist';

export const flag = (m: 'IN' | 'US') => (m === 'IN' ? '🇮🇳' : '🇺🇸');

export function WatchButton({ id, className }: { id: string; className?: string }) {
  const { has, toggle } = useWatchlist();
  const on = has(id);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(id);
      }}
      aria-pressed={on}
      aria-label={on ? 'Remove from watchlist' : 'Add to watchlist'}
      className={clsx('rounded-lg p-1.5 transition-colors hover:bg-muted', on ? 'text-warn' : 'text-sub', className)}
    >
      <Star size={17} fill={on ? 'currentColor' : 'none'} />
    </button>
  );
}

export default function StockCard({ s, status = 'offline' }: { s: LiveStock; status?: FeedStatus }) {
  const upside = change(s.price, s.fairValue);
  const score = overallScore(s);
  return (
    <Link to={`/stocks/${s.market}/${encodeURIComponent(s.symbol)}`} className="card group flex min-w-0 flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-fg/20 hover:shadow-lg hover:shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-sub">
            <span>{flag(s.market)}</span>
            <span className="font-medium">{s.exchange}: {s.symbol}</span>
          </div>
          <h3 className="mt-1 truncate text-base font-semibold group-hover:text-brand">{s.name}</h3>
          <div className="mt-0.5 truncate text-xs text-sub">{s.sector} · {s.industry}</div>
        </div>
        <WatchButton id={`${s.market}:${s.symbol}`} className="-mr-1.5 -mt-1" />
      </div>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="num text-2xl font-bold tracking-tight">{fmtPrice(s.price, s.market)}</span>
            <ChangeTag q={s.quote} />
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-sub">
            <LiveDot status={status} quote={s.quote} />
            <span>· Mcap {fmtMcap(s.marketCap, s.market)}</span>
          </div>
        </div>
        <ScoreRing score={score} size={54} />
      </div>

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-line pt-4">
        <Badge tone={ratingTone[s.rating]}>{s.rating}</Badge>
        <div className="text-right text-xs text-sub">
          Fair value <span className="num font-semibold text-fg">{fmtPrice(s.fairValue, s.market)}</span>{' '}
          <span className={clsx('num font-semibold', upside >= 0 ? 'text-up' : 'text-down')}>{pct(upside)}</span>
        </div>
      </div>
    </Link>
  );
}
