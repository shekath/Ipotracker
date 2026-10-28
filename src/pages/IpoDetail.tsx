import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Check, ExternalLink, Info, X } from 'lucide-react';
import clsx from 'clsx';
import { IPO_SNAPSHOT } from '../data';
import { Badge, CardHead, SegBar } from '../components/ui';
import { IpoFinChart } from '../components/charts';
import { GmpChart, SubscriptionPanel, TimelineSteps, timeAgo } from '../components/live';
import { gmpPct, minInvestment, statusTone } from '../components/IpoCard';
import { fmtCr, fmtDate } from '../lib/format';
import { ipoStatus, verdictTone } from '../lib/scoring';
import { useIpoViews } from '../lib/useIpoViews';
import type { IpoView } from '../lib/ipoView';
import NotFound from './NotFound';

const scoreLabels: Record<string, string> = { business: 'Business quality', financials: 'Financials', valuation: 'Valuation', management: 'Promoter & structure', market: 'Market signals' };

/** Lots → amount, and the value at today's GMP. Retail bids are capped at ₹2 lakh. */
function ApplyCalculator({ ipo }: { ipo: IpoView }) {
  const [lots, setLots] = useState(1);
  if (!ipo.lotSize || !ipo.priceBand) return <p className="text-[13px] text-sub">The calculator appears once the lot size and price band are announced.</p>;
  const lotCost = ipo.lotSize * ipo.priceBand[1];
  const maxLots = Math.max(1, Math.floor(200000 / lotCost));
  const pay = lots * lotCost;
  const gain = ipo.gmp != null ? lots * ipo.lotSize * ipo.gmp : undefined;
  const inr = (v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`;
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-[38px] w-[120px] grid-cols-[38px_1fr_38px] overflow-hidden rounded-lg border border-line2">
          <button className="text-lg text-fg2 hover:bg-muted disabled:opacity-40" onClick={() => setLots((l) => Math.max(1, l - 1))} disabled={lots <= 1} aria-label="Fewer lots">−</button>
          <output className="num grid place-items-center border-x border-line text-sm font-semibold" aria-live="polite">{lots}</output>
          <button className="text-lg text-fg2 hover:bg-muted disabled:opacity-40" onClick={() => setLots((l) => Math.min(maxLots, l + 1))} disabled={lots >= maxLots} aria-label="More lots">+</button>
        </div>
        <span className="text-[13px] text-sub">lot{lots > 1 ? 's' : ''} of {ipo.lotSize} · retail max {maxLots}</span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['You pay', inr(pay), ''],
          ['At GMP', gain != null ? inr(pay + gain) : '—', ''],
          ['Est. gain', gain != null ? `${gain >= 0 ? '+' : '−'}${inr(Math.abs(gain))}` : '—', gain == null ? '' : gain >= 0 ? 'text-up' : 'text-down'],
        ].map(([k, v, c]) => (
          <div key={k} className="rounded-lg bg-muted px-3 py-2.5">
            <dt className="label">{k}</dt>
            <dd className={clsx('num mt-0.5 truncate text-[15px] font-semibold', c)}>{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2.5 text-xs text-sub">GMP is unofficial and can change fast. Treat it as a mood signal, not a promise.</p>
    </div>
  );
}

export default function IpoDetail() {
  const { id } = useParams();
  const { views, status: feedStatus } = useIpoViews();
  const ipo = views.find((i) => i.id === id);
  if (!ipo) {
    if (feedStatus === 'loading') return <div className="card mt-6 h-64 animate-pulse" />;
    return <NotFound />;
  }

  const c = ipo.curated;
  const status = ipoStatus(ipo);
  const minInv = minInvestment(ipo);
  const g = gmpPct(ipo);
  const day = ipo.subscription.length;

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[13px] text-sub">
        <Link to="/ipo" className="hover:text-fg">IPO desk</Link> / <span className="truncate text-fg">{ipo.name}</span>
      </div>

      <div className="card">
        <div className="grid gap-4 px-4 pt-5 sm:px-6 md:grid-cols-[1fr_auto] md:items-start">
          <div className="min-w-0">
            <div className="label">{ipo.type.toUpperCase()} · {ipo.exchange}{ipo.live?.symbol ? ` · ${ipo.live.symbol}` : ''}</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-0.025em]">{ipo.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Badge tone={statusTone[status]}>{status}{status === 'Open' && day ? ` · Day ${day}` : ''}</Badge>
              {ipo.sector && <span className="rounded-md border border-line bg-muted px-2 py-0.5 text-[12.5px] text-fg2">{ipo.sector}</span>}
              {c && <span className="rounded-md border border-line bg-muted px-2 py-0.5 text-[12.5px] text-fg2">{c.freshCr && c.ofsCr ? 'Fresh issue + OFS' : c.ofsCr ? 'Offer for sale' : 'Fresh issue'}</span>}
              {ipo.live && <span className="rounded-md border border-line bg-muted px-2 py-0.5 text-[12.5px] text-fg2">Auto-tracked from NSE</span>}
            </div>
          </div>
          <div className="md:max-w-[300px] md:text-right">
            <Badge tone={verdictTone[ipo.verdict]} className="!h-[30px] !px-3 !text-sm">{ipo.verdict}</Badge>
            <p className="mt-2 text-[12.5px] leading-relaxed text-sub">
              {ipo.basis === 'research' ? 'Based on our review of the RHP: business, financials, valuation, promoters and market signals.' : ipo.basis === 'signals' ? 'Based on market signals only (GMP, overall and QIB demand) until we review the RHP.' : 'Waiting for subscription or GMP data before giving a view.'}
              {ipo.score != null && <> Score <span className="num font-semibold text-fg">{ipo.score}/100</span>.</>}
            </p>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 border-t border-line sm:grid-cols-3 lg:grid-cols-6">
          {[
            ['Price band', ipo.priceBand ? `₹${ipo.priceBand[0]}–${ipo.priceBand[1]}` : 'TBA'],
            ['Lot size', ipo.lotSize ? `${ipo.lotSize} shares` : 'See RHP'],
            ['Min. investment', minInv ? `₹${minInv.toLocaleString('en-IN')}` : '—'],
            ['Issue size', ipo.issueSizeCr ? fmtCr(ipo.issueSizeCr) : '—'],
            ['P/E (post-issue)', c?.pe ? `${c.pe.toFixed(1)}×` : '—'],
            ['Listing', ipo.listingDate ? fmtDate(ipo.listingDate) : 'TBA'],
          ].map(([k, v], i) => (
            <div key={k} className={clsx('border-line px-4 py-3.5 sm:px-6', i % 2 === 1 && 'border-l', i >= 2 && 'border-t', 'sm:border-l-0 sm:border-t-0', i % 3 !== 0 && 'sm:border-l', i >= 3 && 'sm:border-t', 'lg:border-t-0', i % 6 !== 0 && 'lg:border-l')}>
              <dt className="label">{k}</dt>
              <dd className="num mt-0.5 text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {ipo.timeline && (
        <div className="card mt-4">
          <CardHead title="Timeline" sub={ipo.timeline.estimated ? 'SEBI T+3, estimated after close' : 'SEBI T+3'} right={status === 'Open' && day ? <span className="text-[13px] text-sub">Today: bidding day {day}</span> : null} />
          <div className="px-4 py-5 sm:px-5"><TimelineSteps t={ipo.timeline} /></div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="card lg:col-span-7">
          <CardHead title="Subscription by category" right={ipo.latestSub ? <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-up"><i className="h-[7px] w-[7px] rounded-full bg-current" />Updated {timeAgo(ipo.latestSub.time)}</span> : null} />
          {ipo.subscription.length ? (
            <SubscriptionPanel rows={ipo.subscription} closeDate={ipo.closeDate} />
          ) : (
            <p className="px-5 py-6 text-sm text-sub">{status === 'Upcoming' ? 'Bidding has not started. Subscription by category appears here from day 1 and updates through the day.' : ipo.live ? 'No subscription data captured for this issue yet.' : 'Live subscription tracking needs the PHP data API.'}</p>
          )}
        </div>
        <div className="card lg:col-span-5">
          <CardHead title="Grey market premium" right={g != null ? <Badge tone={g >= 0 ? 'up' : 'down'}><span className="num">{g >= 0 ? '+' : ''}{g.toFixed(0)}%</span></Badge> : null} />
          <div className="px-4 sm:px-5">
            {ipo.gmpHistory.length ? (
              <GmpChart points={ipo.gmpHistory} upper={ipo.priceBand?.[1]} />
            ) : (
              <p className="py-6 text-sm text-sub">{c?.gmp != null ? `Last researched GMP: ₹${c.gmp} (as of ${IPO_SNAPSHOT}). Daily history appears once the live feed is running.` : 'No GMP reported yet.'}</p>
            )}
          </div>
          <div className="mt-2 border-t border-line p-4 sm:p-5">
            <div className="label mb-2.5">APPLY CALCULATOR</div>
            <ApplyCalculator ipo={ipo} />
          </div>
        </div>
      </div>

      {c ? (
        <>
          <div className="card mt-4 grid md:grid-cols-2">
            <div className="p-4 sm:p-5">
              <div className="label !text-up">WHY APPLY</div>
              <ul className="mt-2.5 grid gap-2.5 text-[13.5px] leading-relaxed text-fg2">
                {c.strengths.map((t) => <li key={t} className="grid grid-cols-[16px_1fr] gap-2"><Check size={16} className="mt-0.5 text-up" />{t}</li>)}
              </ul>
            </div>
            <div className="border-t border-line p-4 sm:p-5 md:border-l md:border-t-0">
              <div className="label !text-down">WATCH OUT FOR</div>
              <ul className="mt-2.5 grid gap-2.5 text-[13.5px] leading-relaxed text-fg2">
                {c.risks.map((t) => <li key={t} className="grid grid-cols-[16px_1fr] gap-2"><X size={16} className="mt-0.5 text-down" />{t}</li>)}
              </ul>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            <div className="card lg:col-span-7">
              <CardHead title="Our reasoning" />
              <p className="px-4 py-4 text-[14.5px] leading-relaxed sm:px-5">{c.rationale}</p>
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <div className="label">BUSINESS</div>
                <p className="mt-1.5 text-sm leading-relaxed text-fg2">{c.business}</p>
                <div className="label mt-4">USE OF THE MONEY RAISED</div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-sm text-fg2">{c.objects.map((o) => <li key={o}>{o}</li>)}</ul>
              </div>
            </div>
            <div className="card lg:col-span-5">
              <CardHead title="Score breakdown" right={ipo.score != null ? <span className="num font-semibold">{ipo.score}<span className="font-normal text-sub"> / 100</span></span> : null} />
              <div className="divide-y divide-line">
                {Object.entries(c.scores).map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[1fr_auto_34px] items-center gap-3 px-4 py-3 text-sm sm:px-5">
                    <span>{scoreLabels[k]}</span>
                    <SegBar score={v} />
                    <span className="num text-right font-semibold">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-12">
            {c.financials.length > 0 && <div className="card lg:col-span-7">
              <CardHead title="Financials" sub="₹ crore" />
              <div className="p-4 sm:p-5">
                {c.financials.length ? (
                  <>
                    <div className="mb-2 flex flex-wrap gap-4 text-xs text-sub">
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-fg" />Revenue</span>
                      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand" />Profit after tax</span>
                    </div>
                    <IpoFinChart data={c.financials} />
                  </>
                ) : null}
              </div>
            </div>}
            <div className={clsx('card', c.financials.length ? 'lg:col-span-5' : 'lg:col-span-12')}>
              <CardHead title="Key ratios" sub={c.financials.length ? undefined : 'multi-year financials weren’t reported consistently; see the RHP'} />
              <dl className={clsx('grid grid-cols-2', !c.financials.length && 'sm:grid-cols-3 lg:grid-cols-6')}>
                {c.ratios.map((r, i) => (
                  <div key={r.label} className={clsx('border-line px-4 py-3 sm:px-5', i % 2 === 1 && 'border-l', i >= 2 && 'border-t', !c.financials.length && 'sm:border-l-0 sm:border-t-0 sm:[&:not(:first-child)]:border-l')}>
                    <dt className="label">{r.label}</dt>
                    <dd className="num mt-0.5 font-semibold">{r.value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="card card-pad mt-4">
            <div className="label mb-3">Research sources (as of {IPO_SNAPSHOT})</div>
            <ul className="flex flex-wrap gap-2">
              {c.sources.map((s) => (
                <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer noopener" className="chip">{s.label} <ExternalLink size={12} /></a></li>
              ))}
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-sub">Figures come from public RHP summaries; aggregators sometimes disagree. Always check the RHP on SEBI, NSE or BSE before applying.</p>
          </div>
        </>
      ) : (
        <div className="card card-pad mt-4 flex gap-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Info size={18} /></span>
          <div className="text-sm leading-relaxed">
            <div className="font-semibold">Fundamental review pending</div>
            <p className="mt-1 text-fg2">
              This issue was picked up automatically{ipo.live?.firstSeen ? ` on ${new Date(ipo.live.firstSeen).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : ''}. Until we review the RHP, the view above uses market signals only: grey market premium (40%), overall subscription (30%) and QIB demand (30%). Strong demand from institutions is the most reliable of these.
            </p>
            {ipo.live?.symbol && (
              <a className="chip mt-3" href={`https://www.nseindia.com/market-data/issue-information?symbol=${encodeURIComponent(ipo.live.symbol)}&series=EQ&type=Active`} target="_blank" rel="noreferrer noopener">Issue details & RHP on NSE <ExternalLink size={12} /></a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
