import { useState } from 'react';
import { Info, Radio } from 'lucide-react';
import clsx from 'clsx';
import { pipeline } from '../data';
import IpoTable from '../components/IpoTable';
import { CardHead, EmptyState, Segmented } from '../components/ui';
import { timeAgo } from '../components/live';
import { ipoStatus, type IpoStatus } from '../lib/scoring';
import { useIpoViews } from '../lib/useIpoViews';

type Filter = 'All' | IpoStatus;

export default function Ipos() {
  const [filter, setFilter] = useState<Filter>('All');
  const [type, setType] = useState<'All' | 'Mainboard' | 'SME'>('Mainboard');
  const { views, feed, status } = useIpoViews();
  const ipos = views.filter((i) => type === 'All' || i.type === type);
  const counts = ipos.reduce<Record<string, number>>((acc, i) => {
    const s = ipoStatus(i);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const order: IpoStatus[] = ['Open', 'Upcoming', 'Closed', 'Listed'];
  const rows = ipos
    .filter((i) => filter === 'All' || ipoStatus(i) === filter)
    .sort((a, b) => order.indexOf(ipoStatus(a)) - order.indexOf(ipoStatus(b)) || (a.closeDate ?? '9').localeCompare(b.closeDate ?? '9'));

  const opts: { value: Filter; label: string }[] = [
    { value: 'All', label: `All (${ipos.length})` },
    ...order.filter((s) => counts[s]).map((s) => ({ value: s as Filter, label: `${s} (${counts[s]})` })),
  ];

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">IPO desk</h1>
            <p className="mt-1 max-w-2xl text-sm text-sub">Every Indian IPO, picked up from NSE as soon as it's announced, with live subscription by investor category, grey market premium and our apply / avoid call.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented value={type} onChange={setType} options={[{ value: 'Mainboard', label: 'Mainboard' }, { value: 'SME', label: 'SME' }, { value: 'All', label: 'All' }]} />
            <Segmented value={filter} onChange={setFilter} options={opts} />
          </div>
        </div>
        <div className="card overflow-hidden">
        <div className={clsx('flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-line px-4 py-2.5 text-xs sm:px-5', status === 'live' ? 'bg-up/5' : 'bg-muted')}>
          <span className="flex items-center gap-1.5 font-semibold"><Radio size={13} className={status === 'live' ? 'text-up' : 'text-sub'} /> {status === 'live' ? 'Auto-tracking on' : status === 'loading' ? 'Connecting to live feed…' : 'Live feed offline — showing researched issues only'}</span>
          {feed?.lastRun ? <span className="text-sub">Last update {timeAgo(feed.lastRun)}</span> : null}
          {feed && Object.entries(feed.sources).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-sub" title={v.msg}><span className={clsx('h-1.5 w-1.5 rounded-full', v.ok ? 'bg-up' : 'bg-down')} />{k}</span>
          ))}
        </div>
        {rows.length ? <IpoTable rows={rows} /> : <div className="p-4"><EmptyState title="Nothing here" body="No IPOs match this status." /></div>}
        </div>
      </div>

      <section className="card">
        <CardHead title="Big-ticket pipeline" sub="no call until the RHP and price band are out" />
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Company</th><th>Sector</th><th>Expected size</th><th>Status</th><th>What to watch</th></tr></thead>
            <tbody>
              {pipeline.map((p) => (
                <tr key={p.name}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="text-sub">{p.sector}</td>
                  <td>{p.expectedSize}</td>
                  <td className="min-w-[12rem] !whitespace-normal text-sub">{p.status}</td>
                  <td className="min-w-[14rem] !whitespace-normal text-sub">{p.watchNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="card card-pad">
          <div className="mb-4 text-sm font-semibold">How we read an IPO</div>
          <ul className="space-y-3 text-sm leading-relaxed">
            {[
              ['Business (25%)', 'Moat, market size, competitive position, customer & supplier concentration.'],
              ['Financials (25%)', 'Revenue/PAT growth, margins, return ratios, leverage, cash conversion.'],
              ['Valuation (20%)', 'Post-issue P/E and market cap vs. listed peers and growth.'],
              ['Promoter & structure (15%)', 'Fresh issue vs. OFS, use of proceeds, governance track record.'],
              ['Market signals (15%)', 'Grey-market premium, sector sentiment, anchor quality and subscription.'],
            ].map(([t, d]) => (
              <li key={t}><span className="font-semibold">{t}</span> — <span className="text-sub">{d}</span></li>
            ))}
          </ul>
        </div>
        <div className="card card-pad">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Info size={16} className="text-brand" /> Reading the verdicts</div>
          <ul className="space-y-3 text-sm leading-relaxed">
            <li><span className="font-semibold text-up">Apply</span> — <span className="text-sub">good for listing and long-term holding.</span></li>
            <li><span className="font-semibold text-up">Apply · Long Term</span> — <span className="text-sub">fundamentals strong; listing pop uncertain.</span></li>
            <li><span className="font-semibold text-up">Apply · Listing Gains</span> — <span className="text-sub">demand likely strong; valuation full for long-term.</span></li>
            <li><span className="font-semibold text-warn">Neutral</span> — <span className="text-sub">fairly priced; watch post-listing.</span></li>
            <li><span className="font-semibold text-down">Avoid</span> — <span className="text-sub">risks outweigh rewards at the offer price.</span></li>
          </ul>
          <p className="mt-4 text-xs text-sub">GMP (grey-market premium) is unofficial and volatile; never apply on GMP alone.</p>
        </div>
      </section>
    </div>
  );
}
