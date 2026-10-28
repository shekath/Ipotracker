import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { Badge } from './ui';
import { gmpPct, statusTone } from './IpoCard';
import { fmtDate } from '../lib/format';
import { ipoStatus, verdictTone } from '../lib/scoring';
import type { IpoView } from '../lib/ipoView';

const fx = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)}×`);

/** Status line under the name: what happens next and when. */
function when(i: IpoView) {
  const st = ipoStatus(i);
  if (st === 'Upcoming') return i.openDate ? `Opens ${fmtDate(i.openDate)}` : 'Dates TBA';
  if (st === 'Open') return i.closeDate ? `Closes ${fmtDate(i.closeDate)}` : 'Bidding open';
  if (st === 'Closed') return i.listingDate ? `Lists ${fmtDate(i.listingDate)}` : 'Allotment pending';
  return i.listingDate ? `Listed ${fmtDate(i.listingDate)}` : 'Listed';
}

/** Category mix bar: QIB · NII · Retail, widths on a log scale so small numbers stay visible. */
function MixBar({ i }: { i: IpoView }) {
  const s = i.latestSub;
  if (!s) return null;
  const parts = [
    { v: s.qib, cls: 'bg-fg' },
    { v: s.nii, cls: 'bg-brand' },
    { v: s.retail, cls: 'bg-brand/40' },
  ].filter((p) => p.v != null) as { v: number; cls: string }[];
  return (
    <span className="mr-2.5 inline-flex h-1.5 w-[84px] gap-px overflow-hidden rounded-full bg-muted align-middle">
      {parts.map((p, k) => <i key={k} className={p.cls} style={{ flex: Math.max(0.4, Math.log10(p.v + 1.2)) }} />)}
    </span>
  );
}

export default function IpoTable({ rows }: { rows: IpoView[] }) {
  const nav = useNavigate();
  return (
    <div className="overflow-x-auto">
      <table className="table-base">
        <thead>
          <tr>
            <th>Issue</th>
            <th className="hidden md:table-cell">Status</th>
            <th className="hidden !text-right lg:table-cell">Price band</th>
            <th>Subscription <span className="hidden font-normal lg:inline">· QIB · NII · Retail</span></th>
            <th className="!text-right">GMP</th>
            <th className="hidden !text-right lg:table-cell">Est. listing</th>
            <th className="!text-right">Our view</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => {
            const st = ipoStatus(i);
            const g = gmpPct(i);
            const s = i.latestSub;
            return (
              <tr key={i.id} className="cursor-pointer transition-colors hover:bg-muted" onClick={() => nav(`/ipo/${i.id}`)}>
                <td className="min-w-[10rem] !whitespace-normal">
                  <a href={`#/ipo/${i.id}`} onClick={(e) => e.preventDefault()} className="font-semibold hover:text-brand">{i.name}</a>
                  <span className="mt-0.5 block text-[12.5px] text-sub">{i.type}<span className="md:hidden"> · {when(i)}</span></span>
                </td>
                <td className="hidden md:table-cell">
                  <Badge tone={statusTone[st]}>{st}</Badge>
                  <span className="mt-0.5 block text-[12.5px] text-sub">{when(i)}</span>
                </td>
                <td className="num hidden text-right text-fg2 lg:table-cell">{i.priceBand ? `₹${i.priceBand[0]}–${i.priceBand[1]}` : 'TBA'}</td>
                <td>
                  {s?.total != null ? (
                    <span className="whitespace-nowrap">
                      <MixBar i={i} />
                      <span className="num font-semibold">{fx(s.total)}</span>
                      <span className="num ml-2.5 hidden text-[12.5px] text-sub xl:inline">{[s.qib, s.nii, s.retail].map(fx).join(' · ')}</span>
                    </span>
                  ) : (
                    <span className="text-[13px] text-sub">{st === 'Upcoming' ? 'Not open yet' : '—'}</span>
                  )}
                </td>
                <td className="num text-right">
                  {i.gmp != null ? <>₹{i.gmp} {g != null && <span className={clsx('text-[12.5px]', g >= 0 ? 'text-up' : 'text-down')}>{g >= 0 ? '+' : ''}{g.toFixed(0)}%</span>}</> : <span className="text-sub">—</span>}
                </td>
                <td className="num hidden text-right text-fg2 lg:table-cell">{i.gmp != null && i.priceBand ? `₹${(i.priceBand[1] + i.gmp).toLocaleString('en-IN')}` : '—'}</td>
                <td className="text-right"><Badge tone={verdictTone[i.verdict]}>{i.verdict}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
