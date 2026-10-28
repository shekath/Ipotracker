import { Link, useNavigate } from 'react-router-dom';
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight, ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import clsx from 'clsx';
import { stocks } from '../data';
import IpoTable from '../components/IpoTable';
import { Badge, CardHead } from '../components/ui';
import { change, fmtPrice, pct } from '../lib/format';
import { ipoStatus, overallScore, ratingTone } from '../lib/scoring';
import { useIpoViews } from '../lib/useIpoViews';
import { useLiveStocks, useQuotes } from '../lib/live';
import { ChangeTag, PriceChart } from '../components/live';
import { useMarketPref } from '../lib/marketPref';
import { useIndexDefs, useScreener } from '../lib/screener';
import { HEADLINE, sessionInfo } from '../lib/indices';
import type { Market, ScreenerRow } from '../types';

const BROAD: Record<Market, string> = { IN: 'nifty50', US: 'dow30' };

function SessionBar({ market }: { market: Market }) {
  const s = sessionInfo(market);
  const left = s.minutesLeft;
  return (
    <div className="hidden items-center gap-3.5 text-[0.8125rem] text-sub md:flex">
      <span className="num">{s.openLabel}</span>
      <span className="relative h-1.5 w-[200px] rounded-full bg-muted ring-1 ring-inset ring-line">
        <i className="absolute inset-y-0 left-0 rounded-full bg-fg" style={{ width: `${s.progress * 100}%` }} />
        {s.open && <b className="absolute -top-1 h-3.5 w-0.5 rounded-sm bg-fg" style={{ left: `${s.progress * 100}%` }} />}
      </span>
      <span className="num">{s.closeLabel}</span>
      <Badge tone="neutral">{s.open ? `Closes in ${Math.floor(left / 60)}h ${left % 60}m` : 'Market closed'}</Badge>
    </div>
  );
}

const nf = (v: number | null | undefined, d = 2) => (v == null ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));

// NSE industry names are long; these fit the sector chart without truncation.
const SHORT: Record<string, string> = {
  'Oil Gas & Consumable Fuels': 'Oil & gas',
  'Automobile and Auto Components': 'Auto',
  'Information Technology': 'IT',
  'Fast Moving Consumer Goods': 'FMCG',
  'Financial Services': 'Financials',
  'Healthcare': 'Healthcare',
  'Metals & Mining': 'Metals',
  'Construction Materials': 'Cement',
  'Consumer Durables': 'Durables',
  'Consumer Services': 'Consumer svcs',
  'Capital Goods': 'Capital goods',
  'Telecommunication': 'Telecom',
  'Power': 'Power',
  'Chemicals': 'Chemicals',
  'Realty': 'Realty',
  'Media Entertainment & Publication': 'Media',
};

function sectorStats(rows: ScreenerRow[]) {
  const m = new Map<string, { sum: number; n: number }>();
  rows.forEach((r) => {
    if (r.changePct == null || !r.industry) return;
    const e = m.get(r.industry) ?? { sum: 0, n: 0 };
    e.sum += r.changePct;
    e.n += 1;
    m.set(r.industry, e);
  });
  return [...m.entries()].map(([name, e]) => ({ name, avg: e.sum / e.n, n: e.n })).sort((a, b) => b.avg - a.avg);
}

export default function Dashboard() {
  const [market] = useMarketPref();
  const nav = useNavigate();
  const isIN = market === 'IN';
  const head = HEADLINE[market];
  const { quotes } = useQuotes([head.id, head.vix]);
  const hq = quotes[head.id];
  const vq = quotes[head.vix];
  const session = sessionInfo(market);

  const defs = useIndexDefs();
  const broad = defs?.find((d) => d.id === BROAD[market]);
  const { data } = useScreener(broad);
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => r.changePct != null), [data]);
  const sectors = useMemo(() => sectorStats(rows), [rows]);
  const adv = rows.filter((r) => (r.changePct ?? 0) > 0).length;
  const dec = rows.filter((r) => (r.changePct ?? 0) < 0).length;
  const flat = rows.length - adv - dec;

  const [tab, setTab] = useState<'g' | 'l' | 'v'>('g');
  const movers = useMemo(() => {
    const r = [...rows];
    if (tab === 'g') return r.sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0)).slice(0, 6);
    if (tab === 'l') return r.sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0)).slice(0, 6);
    return r.filter((x) => x.volume != null).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, 6);
  }, [rows, tab]);

  const { stocks: live } = useLiveStocks(stocks);
  const pool = live.filter((s) => s.market === market);
  const research = new Map(pool.map((s) => [s.symbol, s]));
  const picks = pool
    .filter((s) => !s.snapshotMismatch && ['Strong Buy', 'Buy', 'Accumulate'].includes(s.rating))
    .sort((a, b) => change(b.price, b.fairValue) - change(a.price, a.fairValue))
    .slice(0, 6);

  const { views } = useIpoViews();
  const order = ['Open', 'Upcoming', 'Closed', 'Listed'];
  const ipoRows = views
    .filter((i) => ipoStatus(i) !== 'Listed')
    .sort((a, b) => order.indexOf(ipoStatus(a)) - order.indexOf(ipoStatus(b)) || (a.closeDate ?? '9').localeCompare(b.closeDate ?? '9'))
    .slice(0, 6);

  // Plain-language summary built only from live numbers on this page.
  const brief: { tone: 'up' | 'down' | 'info'; strong: string; text: string }[] = [];
  if (hq) {
    const up = hq.changePct >= 0;
    brief.push({
      tone: up ? 'up' : 'down',
      strong: `${head.name} is ${up ? 'up' : 'down'} ${Math.abs(hq.changePct).toFixed(2)}%${hq.marketOpen ? ' today' : ' at the last close'}.`,
      text: `It ${hq.marketOpen ? 'is trading' : 'closed'} at ${nf(hq.price)}${hq.high52 ? `, ${Math.abs(change(hq.high52, hq.price)).toFixed(1)}% below its 52-week high` : ''}.`,
    });
  }
  if (sectors.length >= 2) {
    const top = sectors[0];
    const bot = sectors[sectors.length - 1];
    const [tn, bn] = [SHORT[top.name] ?? top.name, SHORT[bot.name] ?? bot.name];
    brief.push({ tone: top.avg >= 0 ? 'up' : 'down', strong: `${tn} leads, ${bn} lags.`, text: `${tn} stocks average ${pct(top.avg, 2)} against ${pct(bot.avg, 2)} for ${bn}.` });
  }
  if (rows.length) {
    const share = adv / rows.length;
    brief.push({ tone: 'info', strong: share >= 0.6 ? 'Broad buying.' : share <= 0.4 ? 'Selling is widespread.' : 'A mixed market.', text: `${adv} of ${rows.length} ${broad?.name ?? ''} stocks are up${vq ? ` and volatility (${head.vixName}) is ${vq.changePct <= 0 ? 'easing' : 'rising'}` : ''}.` });
  }

  const maxAbs = Math.max(...sectors.map((s) => Math.abs(s.avg)), 0.01);
  const extLink = (sym: string) => (isIN ? `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(sym)}` : `https://finance.yahoo.com/quote/${encodeURIComponent(sym.replace('.', '-'))}`);
  const link = 'inline-flex items-center gap-1 text-[0.84375rem] font-medium text-brand hover:underline';

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.025em]">Market overview</h1>
          <p className="mt-1 text-sm text-sub">{session.dateLabel} · {session.exchanges} · prices may be delayed</p>
        </div>
        <SessionBar market={market} />
      </div>

      <div className="grid grid-cols-12 gap-4">
        {/* Headline index */}
        <div className="card col-span-12 lg:col-span-8">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pt-5 sm:px-5">
            <div>
              <div className="label">{head.name}</div>
              <div className="mt-1.5 text-[2.125rem] font-semibold leading-none tracking-[-0.035em] tabular-nums sm:text-[2.375rem]">{hq ? nf(hq.price) : '—'}</div>
            </div>
            <ChangeTag q={hq} abs className="!text-[0.84375rem]" />
          </div>
          <div className="px-4 pt-3 sm:px-5">
            <PriceChart id={head.id} name={head.name} market={market} ranges={['1d', '1mo', '6mo', '1y', '5y']} initialRange="1d" prevClose={hq?.prevClose} height={260} compact />
          </div>
          <dl className="mt-3 grid grid-cols-3 border-t border-line sm:grid-cols-6">
            {(
              [
                ['Day high', nf(hq?.dayHigh)],
                ['Day low', nf(hq?.dayLow)],
                ['Prev close', nf(hq?.prevClose)],
                ['52W high', nf(hq?.high52)],
                ['52W low', nf(hq?.low52)],
                [head.vixName, vq ? <>{nf(vq.price)} <span className={clsx('text-xs', vq.changePct <= 0 ? 'text-up' : 'text-down')}>{pct(vq.changePct, 1)}</span></> : '—'],
              ] as [string, ReactNode][]
            ).map(([k, v], i) => (
              <div key={k} className={clsx('px-4 py-3 sm:px-5', i % 3 !== 0 && 'border-l border-line', i >= 3 && 'max-sm:border-t max-sm:border-line', i === 3 && 'sm:border-l sm:border-line')}>
                <dt className="label">{k}</dt>
                <dd className="num mt-0.5 text-[0.90625rem] font-medium">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Summary */}
        <div className="card col-span-12 flex flex-col md:col-span-6 lg:col-span-4">
          <CardHead title="Today in 30 seconds" right={data?.asOf ? <span className="text-[0.78125rem] text-sub">Updated {new Date(data.asOf * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span> : null} />
          {brief.length ? (
            <ul className="divide-y divide-line px-4 sm:px-5">
              {brief.map((b) => (
                <li key={b.strong} className="grid grid-cols-[22px_1fr] gap-2.5 py-3 text-sm leading-relaxed text-fg2">
                  <span className={clsx('mt-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-md', b.tone === 'up' ? 'bg-up/10 text-up' : b.tone === 'down' ? 'bg-down/10 text-down' : 'bg-brand/10 text-brand')}>
                    {b.tone === 'up' ? <ArrowUpRight size={14} /> : b.tone === 'down' ? <ArrowDownRight size={14} /> : <Info size={13} />}
                  </span>
                  <span><b className="font-semibold text-fg">{b.strong}</b> {b.text}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-sub">The summary appears once live prices load.</p>
          )}
          {rows.length > 0 && (
            <div className="mt-auto border-t border-line px-4 py-4 sm:px-5">
              <div className="flex items-baseline justify-between"><span className="label">Breadth · {broad?.name}</span><span className="num text-[0.8125rem] font-semibold">{dec ? (adv / dec).toFixed(2) : adv} A/D</span></div>
              <div className="mt-2.5 flex h-2.5 gap-0.5 overflow-hidden rounded-full">
                <i className="bg-up" style={{ width: `${(adv / rows.length) * 100}%` }} />
                {flat > 0 && <i className="bg-line2" style={{ width: `${(flat / rows.length) * 100}%` }} />}
                <i className="bg-down" style={{ width: `${(dec / rows.length) * 100}%` }} />
              </div>
              <div className="num mt-2 flex justify-between text-[0.78125rem]"><span className="text-up">{adv} up</span>{flat > 0 && <span className="text-sub">{flat} flat</span>}<span className="text-down">{dec} down</span></div>
            </div>
          )}
        </div>

        {/* Sectors */}
        <div className="card col-span-12 md:col-span-6 lg:col-span-5">
          <CardHead title="Sector performance" sub={broad ? `${broad.name} members, today` : undefined} />
          {sectors.length ? (
            <div className="grid grid-cols-[minmax(0,8.5rem)_1fr_60px] items-center gap-x-3 gap-y-2 px-4 py-4 text-[0.84375rem] sm:px-5">
              {sectors.map((s) => (
                <div key={s.name} className="contents">
                  <span className="truncate text-fg2" title={`${s.name} · ${s.n} stocks`}>{SHORT[s.name] ?? s.name}</span>
                  <div className="relative h-5 before:absolute before:-bottom-[3px] before:-top-[3px] before:left-1/2 before:w-px before:bg-line2">
                    <i className={clsx('absolute top-1 h-3 rounded-[3px]', s.avg >= 0 ? 'left-1/2 bg-up' : 'right-1/2 bg-down')} style={{ width: `${(Math.abs(s.avg) / maxAbs) * 48}%` }} />
                  </div>
                  <span className={clsx('num text-right font-semibold', s.avg >= 0 ? 'text-up' : 'text-down')}>{pct(s.avg, 2)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-sub">Sector moves appear once live prices load.</p>
          )}
        </div>

        {/* Movers */}
        <div className="card col-span-12 lg:col-span-7">
          <div className="card-head !py-0">
            <div className="flex gap-5" role="tablist">
              {([['g', 'Top gainers'], ['l', 'Top losers'], ['v', 'Most active']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('relative h-12 whitespace-nowrap text-[0.84375rem] font-medium', tab === k ? 'text-fg after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-fg' : 'text-sub hover:text-fg')}>{l}</button>
              ))}
            </div>
            <Link to={`/screener?index=${BROAD[market]}`} className={clsx(link, 'max-sm:hidden')}>Open screener <ArrowRight size={13} /></Link>
          </div>
          {movers.length ? (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Stock</th><th className="!text-right">Price</th><th className="!text-right">Change</th><th className="hidden !text-right sm:table-cell">Volume</th><th className="hidden md:table-cell">52-week range</th><th className="!text-right">Our view</th></tr></thead>
                <tbody>
                  {movers.map((r) => {
                    const res = research.get(r.symbol);
                    const pos = r.price != null && r.high52 && r.low52 && r.high52 > r.low52 ? ((r.price - r.low52) / (r.high52 - r.low52)) * 100 : undefined;
                    return (
                      <tr key={r.symbol} className={clsx('transition-colors hover:bg-muted', res && 'cursor-pointer')} onClick={() => res && nav(`/stocks/${market}/${encodeURIComponent(r.symbol)}`)}>
                        <td>
                          {res ? (
                            <Link to={`/stocks/${market}/${encodeURIComponent(r.symbol)}`} className="tk block hover:text-brand" onClick={(e) => e.stopPropagation()}>{r.symbol}</Link>
                          ) : (
                            <span className="tk block">{r.symbol}</span>
                          )}
                          <span className="block max-w-[11rem] truncate text-[0.78125rem] text-sub">{r.name}</span>
                        </td>
                        <td className="num text-right">{r.price != null ? fmtPrice(r.price, market) : '—'}</td>
                        <td className={clsx('num text-right font-semibold', (r.changePct ?? 0) >= 0 ? 'text-up' : 'text-down')}>{pct(r.changePct ?? 0, 2)}</td>
                        <td className="num hidden text-right text-fg2 sm:table-cell">{r.volume != null ? (r.volume >= 1e6 ? `${(r.volume / 1e6).toFixed(1)}M` : `${(r.volume / 1e3).toFixed(0)}K`) : '—'}</td>
                        <td className="hidden md:table-cell">{pos != null ? <span className="relative inline-block h-1 w-24 rounded-full bg-line align-middle"><i className="absolute -top-1 h-3 w-[3px] -translate-x-1/2 rounded-sm bg-fg" style={{ left: `${Math.max(0, Math.min(100, pos))}%` }} /></span> : '—'}</td>
                        <td className="text-right">{res ? <Badge tone={ratingTone[res.rating]}>{res.rating}</Badge> : <a href={extLink(r.symbol)} target="_blank" rel="noreferrer noopener" className="text-[0.78125rem] text-sub hover:text-fg" onClick={(e) => e.stopPropagation()}>Quote ↗</a>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-5 py-6 text-sm text-sub">Movers appear once live prices load.</p>
          )}
        </div>

        {/* Research picks */}
        <div className="card col-span-12">
          <CardHead title="Research picks" sub="positive ratings, ranked by upside to our fair value" right={<Link to="/stocks" className={link}>All stocks <ArrowRight size={13} /></Link>} />
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Stock</th><th className="hidden md:table-cell">Sector</th><th className="!text-right">Price</th><th className="!text-right">Day</th><th className="hidden !text-right sm:table-cell">Fair value</th><th className="!text-right">Upside</th><th className="hidden !text-right lg:table-cell">Score</th><th className="!text-right">Our view</th></tr></thead>
              <tbody>
                {picks.map((s) => (
                  <tr key={s.symbol} className="cursor-pointer transition-colors hover:bg-muted" onClick={() => nav(`/stocks/${s.market}/${encodeURIComponent(s.symbol)}`)}>
                    <td><Link to={`/stocks/${s.market}/${encodeURIComponent(s.symbol)}`} className="tk block hover:text-brand">{s.symbol}</Link><span className="block max-w-[12rem] truncate text-[0.78125rem] text-sub">{s.name}</span></td>
                    <td className="hidden text-fg2 md:table-cell">{s.sector}</td>
                    <td className="num text-right">{fmtPrice(s.price, s.market)}</td>
                    <td className={clsx('num text-right', !s.quote ? 'text-sub' : s.quote.changePct >= 0 ? 'text-up' : 'text-down')}>{s.quote ? pct(s.quote.changePct, 2) : '—'}</td>
                    <td className="num hidden text-right text-fg2 sm:table-cell">{fmtPrice(s.fairValue, s.market)}</td>
                    <td className={clsx('num text-right font-semibold', change(s.price, s.fairValue) >= 0 ? 'text-up' : 'text-down')}>{pct(change(s.price, s.fairValue))}</td>
                    <td className="num hidden text-right lg:table-cell">{overallScore(s)}</td>
                    <td className="text-right"><Badge tone={ratingTone[s.rating]}>{s.rating}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {isIN && (
          <div className="card col-span-12">
            <CardHead title="IPO desk" sub="mainboard & SME · live subscription" right={<Link to="/ipo" className={link}>All IPOs <ArrowRight size={13} /></Link>} />
            {ipoRows.length ? <IpoTable rows={ipoRows} /> : <p className="px-5 py-6 text-sm text-sub">No issues are open or upcoming right now. The IPO desk lists recently listed issues and the pipeline.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
