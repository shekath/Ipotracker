import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, ExternalLink } from 'lucide-react';
import clsx from 'clsx';
import { ipos, IPO_SNAPSHOT } from '../data';
import { Badge, Bar, BulletList, ScoreRing, SectionHeader, Stat, scoreTone } from '../components/ui';
import { IpoFinChart } from '../components/charts';
import { minInvestment, statusTone } from '../components/IpoCard';
import { fmtCr, fmtDate } from '../lib/format';
import { ipoScore, ipoStatus, verdictTone } from '../lib/scoring';
import NotFound from './NotFound';

const scoreLabels: Record<string, string> = { business: 'Business quality', financials: 'Financials', valuation: 'Valuation', management: 'Promoter & structure', market: 'Market signals' };

export default function IpoDetail() {
  const { id } = useParams();
  const ipo = ipos.find((i) => i.id === id);
  if (!ipo) return <NotFound />;

  const status = ipoStatus(ipo);
  const score = ipoScore(ipo);
  const minInv = minInvestment(ipo);
  const gmpPct = ipo.gmp != null ? (ipo.gmp / ipo.priceBand[1]) * 100 : undefined;
  const today = new Date().toISOString().slice(0, 10);
  const timeline = [
    { label: 'Opens', date: ipo.openDate },
    { label: 'Closes', date: ipo.closeDate },
    ...(ipo.allotmentDate ? [{ label: 'Allotment', date: ipo.allotmentDate }] : []),
    { label: 'Listing', date: ipo.listingDate },
  ];

  return (
    <div>
      <Link to="/ipo" className="btn-ghost -ml-3 mb-4"><ArrowLeft size={16} /> IPO desk</Link>

      <div className="card card-pad">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone[status]}>{status}</Badge>
              <span className="text-sm text-sub">{ipo.type} · {ipo.exchange}</span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{ipo.name}</h1>
            <p className="mt-1 text-sm text-sub">{ipo.sector}</p>
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-muted/40 p-4">
            <ScoreRing score={score} size={68} />
            <div>
              <div className="label">Our verdict</div>
              <Badge tone={verdictTone[ipo.verdict]} className="mt-1.5 !px-3 !py-1 !text-sm">{ipo.verdict}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Price band" value={`₹${ipo.priceBand[0]}–${ipo.priceBand[1]}`} />
          <Stat label="Issue size" value={fmtCr(ipo.issueSizeCr)} />
          <Stat label="Fresh / OFS" value={`${Math.round((ipo.freshCr / ipo.issueSizeCr) * 100)}% / ${Math.round((ipo.ofsCr / ipo.issueSizeCr) * 100)}%`} />
          <Stat label="Lot size" value={ipo.lotSize ? `${ipo.lotSize} sh` : 'See RHP'} hint={minInv ? `Min ₹${minInv.toLocaleString('en-IN')}` : undefined} />
          <Stat label="P/E (upper band)" value={ipo.pe ? `${ipo.pe}x` : '—'} />
          <Stat label="GMP (indicative)" value={ipo.gmp != null ? `₹${ipo.gmp}` : 'N/A'} hint={gmpPct != null ? `${gmpPct.toFixed(1)}% est. listing gain` : 'Not reliably reported'} tone={gmpPct == null ? undefined : gmpPct > 5 ? 'up' : 'warn'} />
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="card card-pad lg:col-span-3">
          <div className="text-sm font-semibold">Recommendation rationale</div>
          <p className="mt-3 text-[15px] leading-relaxed">{ipo.rationale}</p>
          <div className="mt-6">
            <div className="label mb-4 flex items-center gap-2"><CalendarCheck size={14} /> Timeline</div>
            <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {timeline.map((t) => {
                const done = t.date <= today;
                return (
                  <li key={t.label} className={clsx('rounded-xl border p-3', done ? 'border-brand/40 bg-brand/5' : 'border-line')}>
                    <div className={clsx('text-xs font-medium', done ? 'text-brand' : 'text-sub')}>{t.label}</div>
                    <div className="num mt-1 text-sm font-semibold">{fmtDate(t.date)}</div>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <div className="card card-pad lg:col-span-2">
          <div className="mb-4 text-sm font-semibold">Score breakdown</div>
          <div className="space-y-4">
            {Object.entries(ipo.scores).map(([k, v]) => (
              <div key={k}>
                <div className="mb-1.5 flex justify-between text-sm"><span className="font-medium">{scoreLabels[k]}</span><span className="num font-semibold">{v}</span></div>
                <Bar value={v} tone={scoreTone(v)} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-10">
        <SectionHeader title="Business & financials" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="card card-pad space-y-5">
            <div>
              <div className="label">Business overview</div>
              <p className="mt-2 text-sm leading-relaxed">{ipo.business}</p>
            </div>
            <div>
              <div className="label mb-2">Objects of the issue</div>
              <BulletList items={ipo.objects} tone="neutral" />
            </div>
          </div>
          <div className="card card-pad">
            {ipo.financials.length ? (
              <>
                <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Revenue (₹ Cr)</span>
                  <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />PAT (₹ Cr)</span>
                </div>
                <IpoFinChart data={ipo.financials} />
              </>
            ) : (
              <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-sub">Multi-year financials were not consistently reported across sources — see the key ratios and RHP.</div>
            )}
          </div>
        </div>
        <div className="card card-pad mt-6">
          <div className="label mb-4">Key ratios</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
            {ipo.ratios.map((r) => <Stat key={r.label} label={r.label} value={r.value} />)}
          </div>
        </div>
      </section>

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        <div className="card card-pad">
          <div className="mb-4 text-sm font-semibold text-up">Strengths</div>
          <BulletList items={ipo.strengths} tone="up" />
        </div>
        <div className="card card-pad">
          <div className="mb-4 text-sm font-semibold text-down">Risks</div>
          <BulletList items={ipo.risks} tone="down" />
        </div>
      </section>

      <section className="mt-10">
        <div className="card card-pad">
          <div className="label mb-3">Sources (as of {IPO_SNAPSHOT})</div>
          <ul className="flex flex-wrap gap-2">
            {ipo.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="chip">{s.label} <ExternalLink size={12} /></a>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-sub">Figures are compiled from public RHP summaries; aggregators occasionally disagree. Always verify with the RHP on SEBI/NSE/BSE before applying.</p>
        </div>
      </section>
    </div>
  );
}
