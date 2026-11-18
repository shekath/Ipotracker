import { useEffect, useState } from 'react';
import { Info, Radio } from 'lucide-react';
import clsx from 'clsx';
import { pipeline } from '../data';
import IpoCard from '../components/IpoCard';
import { EmptyState, SectionHeader, Segmented, LoadingCard } from '../components/ui';
import { timeAgo } from '../components/live';
import { ipoStatus, type IpoStatus } from '../lib/scoring';
import { useIpoViews } from '../lib/useIpoViews';
import { retryIpos } from '../lib/live';
import { getJSON } from '../lib/api';

type Filter = 'All' | IpoStatus;

/** Pipeline rows minus any company that is already trading on NSE or BSE. */
function useUpcomingPipeline() {
  const [listed, setListed] = useState<Record<string, unknown>>({});
  useEffect(() => {
    let live = true;
    getJSON<{ listed: Record<string, unknown> }>(`pipeline.php?names=${encodeURIComponent(pipeline.map((p) => p.match).join('|'))}`)
      .then((r) => { if (live) setListed(r.listed ?? {}); })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return pipeline.filter((p) => !listed[p.match]);
}

export default function Ipos() {
  const [filter, setFilter] = useState<Filter>('All');
  const [type, setType] = useState<'All' | 'Mainboard' | 'SME'>('Mainboard');
  const { views, feed, status } = useIpoViews();
  const upcoming = useUpcomingPipeline();
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
    <div className="space-y-12">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">IPO desk · India</h1>
            <p className="mt-1 max-w-2xl text-sm text-sub">New issues are picked up automatically from NSE as soon as they are announced, with day-wise subscription by investor category and grey-market premium. Researched issues carry a full fundamental verdict; others get a market-signal view.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Segmented value={type} onChange={setType} options={[{ value: 'Mainboard', label: 'Mainboard' }, { value: 'SME', label: 'SME' }, { value: 'All', label: 'All' }]} />
            <Segmented value={filter} onChange={setFilter} options={opts} />
          </div>
        </div>
        <div className={clsx('mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border px-4 py-2.5 text-xs', status === 'live' ? 'border-up/30 bg-up/5' : 'border-line bg-muted/40')}>
          <span className="flex items-center gap-1.5 font-semibold"><Radio size={13} className={status === 'live' ? 'text-up' : 'text-sub'} /> {status === 'live' ? 'Auto-tracking on' : status === 'loading' ? 'Connecting to live feed…' : 'Live feed offline — showing researched issues only'}</span>
          {feed?.lastRun ? <span className="text-sub">Last update {timeAgo(feed.lastRun)}</span> : null}
          {feed && Object.entries(feed.sources).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1 text-sub" title={v.msg}><span className={clsx('h-1.5 w-1.5 rounded-full', v.ok ? 'bg-up' : 'bg-down')} />{k}</span>
          ))}
        </div>
        <div className="mt-6">
          {rows.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((i) => <IpoCard key={i.id} ipo={i} />)}
            </div>
          ) : status === 'loading' ? (
            <LoadingCard className="py-14" label="Loading IPOs…" />
          ) : status === 'offline' ? (
            <EmptyState title="Couldn't reach the IPO feed" body="We couldn't load the latest issues from NSE. Check your connection and try again." action={<button className="btn bg-fg text-bg hover:opacity-90" onClick={retryIpos}>Try again</button>} />
          ) : (
            <EmptyState title="No IPOs here right now" body={filter === 'All' ? 'No issues are open, upcoming or recently closed on this board.' : 'No IPOs match this status.'} />
          )}
        </div>
      </div>

      <section>
        <SectionHeader title="Big-ticket pipeline" subtitle="Large issues still to come — no recommendation until the RHP and price band are out" />
        {upcoming.length ? (
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Company</th><th>Sector</th><th>Expected size</th><th>Status</th><th>What to watch</th></tr></thead>
            <tbody>
              {upcoming.map((p) => (
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
        ) : (
          <EmptyState title="Nothing in the pipeline" body="Every big issue we were watching has now listed." />
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
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
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Info size={16} className="text-brand-ink" /> Reading the verdicts</div>
          <ul className="space-y-3 text-sm leading-relaxed">
            <li><span className="font-semibold text-up">Apply</span> — <span className="text-sub">good for listing and long-term holding.</span></li>
            <li><span className="font-semibold text-up">Apply · Long Term</span> — <span className="text-sub">fundamentals strong; listing pop uncertain.</span></li>
            <li><span className="font-semibold text-brand-ink">Apply · Listing Gains</span> — <span className="text-sub">demand likely strong; valuation full for long-term.</span></li>
            <li><span className="font-semibold text-warn">Neutral</span> — <span className="text-sub">fairly priced; watch post-listing.</span></li>
            <li><span className="font-semibold text-down">Avoid</span> — <span className="text-sub">risks outweigh rewards at the offer price.</span></li>
          </ul>
          <p className="mt-4 text-xs text-sub">GMP (grey-market premium) is unofficial and volatile; never apply on GMP alone.</p>
        </div>
      </section>
    </div>
  );
}
