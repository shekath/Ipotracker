import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Info, Radio } from 'lucide-react';
import { IPO_SNAPSHOT } from '../data';
import { Badge, Bar, BulletList, ScoreRing, SectionHeader, Stat, scoreTone } from '../components/ui';
import { IpoFinChart } from '../components/charts';
import { GmpChart, SubscriptionPanel, TimelineSteps, timeAgo } from '../components/live';
import { gmpPct, minInvestment, statusTone } from '../components/IpoCard';
import { fmtCr } from '../lib/format';
import { ipoStatus, verdictTone } from '../lib/scoring';
import { useIpoViews } from '../lib/useIpoViews';
import NotFound from './NotFound';

const scoreLabels: Record<string, string> = { business: 'Business quality', financials: 'Financials', valuation: 'Valuation', management: 'Promoter & structure', market: 'Market signals' };

export default function IpoDetail() {
  const { id } = useParams();
  const { views, status: feedStatus } = useIpoViews();
  const ipo = views.find((i) => i.id === id);
  if (!ipo) {
    if (feedStatus === 'loading') return <div className="card card-pad mt-6 h-64 animate-pulse" />;
    return <NotFound />;
  }

  const c = ipo.curated;
  const status = ipoStatus(ipo);
  const minInv = minInvestment(ipo);
  const g = gmpPct(ipo);

  return (
    <div>
      <Link to="/ipo" className="btn-ghost -ml-3 mb-4"><ArrowLeft size={16} /> IPO desk</Link>

      <div className="card card-pad">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusTone[status]}>{status}</Badge>
              <span className="text-sm text-sub">{ipo.type} · {ipo.exchange}{ipo.live?.symbol ? ` · ${ipo.live.symbol}` : ''}</span>
              {ipo.live && <Badge tone="brand"><Radio size={11} /> Live tracked</Badge>}
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{ipo.name}</h1>
            {ipo.sector && <p className="mt-1 text-sm text-sub">{ipo.sector}</p>}
          </div>
          <div className="flex items-center gap-4 rounded-2xl border border-line bg-muted/40 p-4">
            {ipo.score != null && <ScoreRing score={ipo.score} size={68} />}
            <div>
              <div className="label">{ipo.basis === 'research' ? 'Our verdict' : ipo.basis === 'signals' ? 'Signal-based view' : 'Status'}</div>
              <Badge tone={verdictTone[ipo.verdict]} className="mt-1.5 !px-3 !py-1 !text-sm">{ipo.verdict}</Badge>
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line pt-6 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Price band" value={ipo.priceBand ? `₹${ipo.priceBand[0]}–${ipo.priceBand[1]}` : 'TBA'} />
          <Stat label="Issue size" value={ipo.issueSizeCr ? fmtCr(ipo.issueSizeCr) : '—'} hint={!c && ipo.issueSizeCr ? 'At upper band' : undefined} />
          <Stat label="Fresh / OFS" value={c ? `${Math.round((c.freshCr / c.issueSizeCr) * 100)}% / ${Math.round((c.ofsCr / c.issueSizeCr) * 100)}%` : 'See RHP'} />
          <Stat label="Lot size" value={ipo.lotSize ? `${ipo.lotSize} sh` : 'See RHP'} hint={minInv ? `Min ₹${minInv.toLocaleString('en-IN')}` : undefined} />
          <Stat label="Subscribed" value={ipo.latestSub?.total != null ? `${ipo.latestSub.total.toFixed(2)}x` : '—'} tone={ipo.latestSub?.total != null ? (ipo.latestSub.total >= 1 ? 'up' : 'warn') : undefined} hint={ipo.latestSub ? `Updated ${timeAgo(ipo.latestSub.time)}` : status === 'Upcoming' ? 'Opens soon' : undefined} />
          <Stat label="GMP (indicative)" value={ipo.gmp != null ? `₹${ipo.gmp}` : 'N/A'} hint={g != null ? `${g.toFixed(1)}% est. listing gain` : 'Not reported yet'} tone={g == null ? undefined : g > 5 ? 'up' : 'warn'} />
        </div>
      </div>

      {ipo.timeline && (
        <section className="mt-8">
          <SectionHeader title="Listing timeline" />
          <div className="card card-pad"><TimelineSteps t={ipo.timeline} /></div>
        </section>
      )}

      <section className="mt-10">
        <SectionHeader title="Subscription status" subtitle="Day-wise demand from institutions (QIB), HNIs (NII) and retail investors" />
        {ipo.subscription.length ? (
          <div className="card card-pad"><SubscriptionPanel rows={ipo.subscription} /></div>
        ) : (
          <div className="card card-pad text-sm text-sub">
            {status === 'Upcoming' ? 'Bidding has not started. Subscription figures appear here from Day 1 and update through the day.' : ipo.live ? 'No subscription data captured for this issue yet.' : 'Live subscription tracking needs the PHP data API (active once deployed to your hosting).'}
          </div>
        )}
      </section>

      <section className="mt-10">
        <SectionHeader title="Grey-market premium" subtitle="Unofficial, indicative premium over the upper price band" />
        {ipo.gmpHistory.length ? (
          <div className="card card-pad">
            <GmpChart points={ipo.gmpHistory} upper={ipo.priceBand?.[1]} />
            <p className="mt-3 text-xs text-sub">Collected daily from public GMP trackers. GMP is unregulated and can change sharply; never apply on GMP alone.</p>
          </div>
        ) : (
          <div className="card card-pad text-sm text-sub">{c?.gmp != null ? `Last researched GMP: ₹${c.gmp} (as of ${IPO_SNAPSHOT}). Daily GMP history appears once the live feed is running.` : 'No GMP reported yet.'}</div>
        )}
      </section>

      {c ? (
        <>
          <div className="mt-10 grid gap-6 lg:grid-cols-5">
            <div className="card card-pad lg:col-span-3">
              <div className="text-sm font-semibold">Recommendation rationale</div>
              <p className="mt-3 text-[15px] leading-relaxed">{c.rationale}</p>
            </div>
            <div className="card card-pad lg:col-span-2">
              <div className="mb-4 text-sm font-semibold">Score breakdown</div>
              <div className="space-y-4">
                {Object.entries(c.scores).map(([k, v]) => (
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
                  <p className="mt-2 text-sm leading-relaxed">{c.business}</p>
                </div>
                <div>
                  <div className="label mb-2">Objects of the issue</div>
                  <BulletList items={c.objects} tone="neutral" />
                </div>
              </div>
              <div className="card card-pad">
                {c.financials.length ? (
                  <>
                    <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Revenue (₹ Cr)</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />PAT (₹ Cr)</span>
                    </div>
                    <IpoFinChart data={c.financials} />
                  </>
                ) : (
                  <div className="flex h-full min-h-40 items-center justify-center text-center text-sm text-sub">Multi-year financials were not consistently reported across sources — see the key ratios and RHP.</div>
                )}
              </div>
            </div>
            <div className="card card-pad mt-6">
              <div className="label mb-4">Key ratios</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
                {c.ratios.map((r) => <Stat key={r.label} label={r.label} value={r.value} />)}
              </div>
            </div>
          </section>

          <section className="mt-10 grid gap-6 lg:grid-cols-2">
            <div className="card card-pad">
              <div className="mb-4 text-sm font-semibold text-up">Strengths</div>
              <BulletList items={c.strengths} tone="up" />
            </div>
            <div className="card card-pad">
              <div className="mb-4 text-sm font-semibold text-down">Risks</div>
              <BulletList items={c.risks} tone="down" />
            </div>
          </section>

          <section className="mt-10">
            <div className="card card-pad">
              <div className="label mb-3">Research sources (as of {IPO_SNAPSHOT})</div>
              <ul className="flex flex-wrap gap-2">
                {c.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer noopener" className="chip">{s.label} <ExternalLink size={12} /></a>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-relaxed text-sub">Figures are compiled from public RHP summaries; aggregators occasionally disagree. Always verify with the RHP on SEBI/NSE/BSE before applying.</p>
            </div>
          </section>
        </>
      ) : (
        <section className="mt-10">
          <div className="card card-pad flex gap-4">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand"><Info size={18} /></span>
            <div className="text-sm leading-relaxed">
              <div className="font-semibold">Fundamental review pending</div>
              <p className="mt-1 text-sub">
                This issue was picked up automatically{ipo.live?.firstSeen ? ` on ${new Date(ipo.live.firstSeen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}. Until our analysts review the RHP, the view above is based only on market signals — grey-market premium (40%), overall subscription (30%) and QIB demand (30%). Strong institutional demand is the most reliable of these signals.
              </p>
              {ipo.live?.symbol && (
                <a className="chip mt-3" href={`https://www.nseindia.com/market-data/issue-information?symbol=${encodeURIComponent(ipo.live.symbol)}&series=EQ&type=Active`} target="_blank" rel="noreferrer noopener">Issue details & RHP on NSE <ExternalLink size={12} /></a>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
