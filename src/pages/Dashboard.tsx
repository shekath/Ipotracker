import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowRight, Rocket, ShieldCheck, Sparkles, Target } from 'lucide-react';
import clsx from 'clsx';
import { stocks, STOCK_SNAPSHOT } from '../data';
import StockCard from '../components/StockCard';
import IpoCard from '../components/IpoCard';
import { Badge, SectionHeader, Segmented } from '../components/ui';
import { change, pct } from '../lib/format';
import { ipoStatus, overallScore } from '../lib/scoring';
import { useIpoViews } from '../lib/useIpoViews';
import { useLiveStocks } from '../lib/live';
import { LiveDot } from '../components/live';
import type { Market } from '../types';

export default function Dashboard() {
  const [market, setMarket] = useState<Market | 'ALL'>('ALL');
  const { stocks: live, status } = useLiveStocks(stocks);
  const pool = live.filter((s) => market === 'ALL' || s.market === market);
  const { views } = useIpoViews();

  const topPicks = useMemo(
    () =>
      [...pool]
        .filter((s) => ['Strong Buy', 'Buy'].includes(s.rating) && s.conviction === 'High')
        .sort((a, b) => change(b.price, b.fairValue) - change(a.price, a.fairValue))
        .slice(0, 6),
    [pool],
  );

  const sectorStats = useMemo(() => {
    const m = new Map<string, { n: number; up: number; score: number }>();
    pool.forEach((s) => {
      const e = m.get(s.sector) ?? { n: 0, up: 0, score: 0 };
      e.n += 1;
      e.up += change(s.price, s.fairValue);
      e.score += overallScore(s);
      m.set(s.sector, e);
    });
    return [...m.entries()].map(([sector, e]) => ({ sector, n: e.n, up: e.up / e.n, score: Math.round(e.score / e.n) })).sort((a, b) => b.up - a.up);
  }, [pool]);

  const liveIpos = views.filter((i) => i.type === 'Mainboard' && ['Open', 'Upcoming'].includes(ipoStatus(i)));
  const avgUpside = pool.reduce((a, s) => a + change(s.price, s.fairValue), 0) / pool.length;
  const buys = pool.filter((s) => ['Strong Buy', 'Buy', 'Accumulate'].includes(s.rating)).length;
  const maxUp = Math.max(...sectorStats.map((s) => Math.abs(s.up)), 1);

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-3xl border border-line bg-surface px-6 py-10 sm:px-10 sm:py-14">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative max-w-3xl">
          <Badge tone="brand" className="!whitespace-normal"><Sparkles size={12} className="shrink-0" /> {status === 'live' ? 'Live prices · auto-tracked IPOs' : `Research snapshot · ${STOCK_SNAPSHOT}`}</Badge>
          <h1 className="mt-5 text-3xl font-bold tracking-tight sm:text-5xl sm:leading-[1.1]">
            Institutional-grade research for <span className="text-brand">Indian & US</span> markets.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-sub sm:text-lg">
            Fundamentals, business models, quarterly results, growth forecasts and clear trade plans with targets and stop losses — plus a deep-dive IPO desk for the Indian primary market.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/stocks" className="btn bg-fg text-bg hover:opacity-90">Explore stocks <ArrowRight size={16} /></Link>
            <Link to="/ipo" className="btn border border-line bg-surface hover:bg-muted"><Rocket size={16} /> IPO desk</Link>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[
          { label: 'Stocks covered', value: stocks.length, dot: true, hint: `${stocks.filter((s) => s.market === 'IN').length} India · ${stocks.filter((s) => s.market === 'US').length} US` },
          { label: 'Positive ratings', value: `${buys}/${pool.length}`, hint: 'Strong Buy, Buy, Accumulate' },
          { label: 'Avg. upside to FV', value: pct(avgUpside), hint: 'Across selected market', tone: avgUpside >= 0 ? 'text-up' : 'text-down' },
          { label: 'Live IPOs', value: liveIpos.length, hint: 'Open or opening soon' },
        ].map((k) => (
          <div key={k.label} className="card p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2"><span className="label">{k.label}</span>{'dot' in k && <LiveDot status={status} quote={pool.find((s) => s.quote)?.quote} />}</div>
            <div className={clsx('num mt-2 text-2xl font-bold sm:text-3xl', k.tone)}>{k.value}</div>
            <div className="mt-1 text-xs text-sub">{k.hint}</div>
          </div>
        ))}
      </section>

      <section>
        <SectionHeader
          title="High-conviction picks"
          subtitle="Buy-rated, high-conviction names ranked by upside to fair value"
          right={<Segmented value={market} onChange={setMarket} options={[{ value: 'ALL', label: 'All' }, { value: 'IN', label: '🇮🇳 India' }, { value: 'US', label: '🇺🇸 US' }]} />}
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topPicks.map((s) => <StockCard key={s.market + s.symbol} s={s} status={status} />)}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="card card-pad lg:col-span-3">
          <SectionHeader title="Sector outlook" subtitle="Average upside to fair value and composite score" />
          <div className="space-y-3.5">
            {sectorStats.map((s) => (
              <Link to={`/stocks?sector=${encodeURIComponent(s.sector)}${market !== 'ALL' ? `&market=${market}` : ''}`} key={s.sector} className="group grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[10rem_1fr_auto]">
                <div className="truncate text-sm font-medium group-hover:text-brand">{s.sector} <span className="text-xs text-sub">({s.n})</span></div>
                <div className="relative h-2 rounded-full bg-muted">
                  <div className={clsx('absolute h-2 rounded-full', s.up >= 0 ? 'bg-up' : 'bg-down')} style={{ width: `${(Math.abs(s.up) / maxUp) * 100}%` }} />
                </div>
                <div className={clsx('num w-16 text-right text-sm font-semibold', s.up >= 0 ? 'text-up' : 'text-down')}>{pct(s.up)}</div>
              </Link>
            ))}
          </div>
        </div>
        <div className="card card-pad lg:col-span-2">
          <SectionHeader title="How to use MarketLens" />
          <ul className="space-y-4 text-sm">
            {[
              { icon: Target, t: 'Trade plans', d: 'Each stock carries short-term (3–6 m) and long-term (12–24 m) entry, target and stop-loss levels with reward-to-risk.' },
              { icon: ShieldCheck, t: 'Scorecards', d: 'A rule-based 5-pillar score (valuation, growth, profitability, balance sheet, momentum) keeps opinions honest.' },
              { icon: Rocket, t: 'IPO verdicts', d: 'Apply / Avoid calls built from business quality, financials, valuation, promoter and market signals.' },
            ].map(({ icon: Icon, t, d }) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Icon size={16} /></span>
                <div>
                  <div className="font-semibold">{t}</div>
                  <p className="mt-0.5 leading-relaxed text-sub">{d}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <SectionHeader
          title="IPOs open & upcoming"
          subtitle="Indian mainboard issues with our apply / avoid view"
          right={<Link to="/ipo" className="btn-ghost">View all <ArrowRight size={15} /></Link>}
        />
        {liveIpos.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {liveIpos.slice(0, 6).map((i) => <IpoCard key={i.id} ipo={i} />)}
          </div>
        ) : (
          <div className="card card-pad text-sm text-sub">No issues are open right now. See the IPO desk for recently closed issues and the pipeline.</div>
        )}
      </section>
    </div>
  );
}
