import { Link } from 'react-router-dom';
import { CalendarDays, Radio } from 'lucide-react';
import clsx from 'clsx';
import { Badge, ScoreRing, type Tone } from './ui';
import { fmtCr, fmtDate } from '../lib/format';
import { ipoStatus, verdictTone, type IpoStatus } from '../lib/scoring';
import type { IpoView } from '../lib/ipoView';

export const statusTone: Record<IpoStatus, Tone> = { Open: 'up', Upcoming: 'brand', Closed: 'warn', Listed: 'neutral' };

export const minInvestment = (i: Pick<IpoView, 'lotSize' | 'priceBand'>) => (i.lotSize && i.priceBand ? i.lotSize * i.priceBand[1] : undefined);

export const gmpPct = (i: Pick<IpoView, 'gmp' | 'priceBand'>) => (i.gmp != null && i.priceBand ? (i.gmp / i.priceBand[1]) * 100 : undefined);

export default function IpoCard({ ipo }: { ipo: IpoView }) {
  const status = ipoStatus(ipo);
  const g = gmpPct(ipo);
  const minInv = minInvestment(ipo);
  const total = ipo.latestSub?.total;
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
            {ipo.live && !ipo.curated && <Badge tone="brand"><Radio size={11} /> Auto-tracked</Badge>}
          </div>
          <h3 className="mt-2 text-base font-semibold leading-snug group-hover:text-brand">{ipo.name}</h3>
          <div className="mt-0.5 text-xs text-sub">{ipo.sector ?? (ipo.live?.symbol ? `NSE: ${ipo.live.symbol}` : 'Details from exchange filings')}</div>
        </div>
        {ipo.score != null ? <ScoreRing score={ipo.score} size={54} /> : null}
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="label">Price band</div>
          <div className="num mt-1 font-semibold">{ipo.priceBand ? `₹${ipo.priceBand[0]}–${ipo.priceBand[1]}` : 'TBA'}</div>
        </div>
        <div>
          <div className="label">{total != null ? 'Subscribed' : 'Issue size'}</div>
          <div className={clsx('num mt-1 font-semibold', total != null && (total >= 1 ? 'text-up' : 'text-warn'))}>
            {total != null ? `${total.toFixed(2)}x` : ipo.issueSizeCr ? fmtCr(ipo.issueSizeCr) : '—'}
          </div>
        </div>
        <div>
          <div className="label">GMP</div>
          <div className={clsx('num mt-1 font-semibold', g == null ? 'text-sub' : g > 5 ? 'text-up' : g < 0 ? 'text-down' : 'text-warn')}>
            {g == null ? 'N/A' : `₹${ipo.gmp} · ${g.toFixed(0)}%`}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2 text-xs text-sub">
        <CalendarDays size={14} className="shrink-0" />
        {ipo.openDate && ipo.closeDate ? `${fmtDate(ipo.openDate)} – ${fmtDate(ipo.closeDate)}` : 'Dates TBA'}
        {ipo.listingDate && ` · Lists ${fmtDate(ipo.listingDate)}`}
        {minInv && <span className="num ml-auto">Min ₹{minInv.toLocaleString('en-IN')}</span>}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-4">
        <span className="text-xs text-sub">{ipo.basis === 'research' ? 'Our view' : ipo.basis === 'signals' ? 'Signal-based view' : 'Awaiting data'}</span>
        <Badge tone={verdictTone[ipo.verdict]}>{ipo.verdict}</Badge>
      </div>
    </Link>
  );
}
