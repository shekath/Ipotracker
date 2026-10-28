import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import clsx from 'clsx';
import type { Ipo } from '../types';
import { Badge, ScoreRing, type Tone } from './ui';
import { fmtCr, fmtDate } from '../lib/format';
import { ipoScore, ipoStatus, verdictTone, type IpoStatus } from '../lib/scoring';

export const statusTone: Record<IpoStatus, Tone> = { Open: 'up', Upcoming: 'brand', Closed: 'warn', Listed: 'neutral' };

export function minInvestment(i: Ipo) {
  return i.lotSize ? i.lotSize * i.priceBand[1] : undefined;
}

export default function IpoCard({ ipo }: { ipo: Ipo }) {
  const status = ipoStatus(ipo);
  const score = ipoScore(ipo);
  const gmpPct = ipo.gmp != null ? (ipo.gmp / ipo.priceBand[1]) * 100 : undefined;
  const minInv = minInvestment(ipo);
  return (
    <Link to={`/ipo/${ipo.id}`} className="card group flex min-w-0 flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-fg/20 hover:shadow-lg hover:shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone[status]}>
              {status === 'Open' && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
              {status}
            </Badge>
            <span className="text-xs text-sub">{ipo.type}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold leading-snug group-hover:text-brand">{ipo.name}</h3>
          <div className="mt-0.5 text-xs text-sub">{ipo.sector}</div>
        </div>
        <ScoreRing score={score} size={54} />
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="label">Price band</div>
          <div className="num mt-1 font-semibold">₹{ipo.priceBand[0]}–{ipo.priceBand[1]}</div>
        </div>
        <div>
          <div className="label">Issue size</div>
          <div className="num mt-1 font-semibold">{fmtCr(ipo.issueSizeCr)}</div>
        </div>
        <div>
          <div className="label">GMP</div>
          <div className={clsx('num mt-1 font-semibold', gmpPct == null ? 'text-sub' : gmpPct > 5 ? 'text-up' : 'text-warn')}>
            {gmpPct == null ? 'N/A' : `${gmpPct.toFixed(1)}%`}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-sub">
        <CalendarDays size={14} />
        {fmtDate(ipo.openDate)} – {fmtDate(ipo.closeDate)} · Lists {fmtDate(ipo.listingDate)}
        {minInv && <span className="ml-auto num">Min ₹{minInv.toLocaleString('en-IN')}</span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
        <span className="text-xs text-sub">Our view</span>
        <Badge tone={verdictTone[ipo.verdict]}>{ipo.verdict}</Badge>
      </div>
    </Link>
  );
}
