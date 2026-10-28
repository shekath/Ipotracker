import { useState } from 'react';
import { Info } from 'lucide-react';
import { ipos, pipeline, IPO_SNAPSHOT } from '../data';
import IpoCard from '../components/IpoCard';
import { EmptyState, SectionHeader, Segmented } from '../components/ui';
import { ipoStatus, type IpoStatus } from '../lib/scoring';

type Filter = 'All' | IpoStatus;

export default function Ipos() {
  const [filter, setFilter] = useState<Filter>('All');
  const counts = ipos.reduce<Record<string, number>>((acc, i) => {
    const s = ipoStatus(i);
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const order: IpoStatus[] = ['Open', 'Upcoming', 'Closed', 'Listed'];
  const rows = ipos
    .filter((i) => filter === 'All' || ipoStatus(i) === filter)
    .sort((a, b) => order.indexOf(ipoStatus(a)) - order.indexOf(ipoStatus(b)) || a.closeDate.localeCompare(b.closeDate));

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
            <p className="mt-1 max-w-2xl text-sm text-sub">Ongoing and upcoming mainboard IPOs analysed on business quality, financials, valuation, promoters and market signals. Data as of {IPO_SNAPSHOT}; status updates automatically from issue dates.</p>
          </div>
          <Segmented value={filter} onChange={setFilter} options={opts} />
        </div>
        <div className="mt-6">
          {rows.length ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((i) => <IpoCard key={i.id} ipo={i} />)}
            </div>
          ) : (
            <EmptyState title="Nothing here" body="No IPOs match this status." />
          )}
        </div>
      </div>

      <section>
        <SectionHeader title="Big-ticket pipeline" subtitle="Large issues to watch — no recommendation until the RHP and price band are out" />
        <div className="card overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Company</th><th>Sector</th><th>Expected size</th><th>Status</th><th>What to watch</th></tr></thead>
            <tbody>
              {pipeline.map((p) => (
                <tr key={p.name}>
                  <td className="font-semibold">{p.name}</td>
                  <td className="text-sub">{p.sector}</td>
                  <td>{p.expectedSize}</td>
                  <td className="text-sub">{p.status}</td>
                  <td className="min-w-[18rem] !whitespace-normal text-sub">{p.watchNote}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold"><Info size={16} className="text-brand" /> Reading the verdicts</div>
          <ul className="space-y-3 text-sm leading-relaxed">
            <li><span className="font-semibold text-up">Apply</span> — <span className="text-sub">good for listing and long-term holding.</span></li>
            <li><span className="font-semibold text-up">Apply · Long Term</span> — <span className="text-sub">fundamentals strong; listing pop uncertain.</span></li>
            <li><span className="font-semibold text-brand">Apply · Listing Gains</span> — <span className="text-sub">demand likely strong; valuation full for long-term.</span></li>
            <li><span className="font-semibold text-warn">Neutral</span> — <span className="text-sub">fairly priced; watch post-listing.</span></li>
            <li><span className="font-semibold text-down">Avoid</span> — <span className="text-sub">risks outweigh rewards at the offer price.</span></li>
          </ul>
          <p className="mt-4 text-xs text-sub">GMP (grey-market premium) is unofficial and volatile; never apply on GMP alone.</p>
        </div>
      </section>
    </div>
  );
}
