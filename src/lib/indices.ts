import type { Market } from '../types';

export interface TapeItem {
  id: string;
  label: string;
  /** Prefix for the value, e.g. "$" for Brent. */
  unit?: string;
  suffix?: string;
}

/** Index and macro tickers shown in the header strip (ids served by quotes.php as IX:*). */
export const TAPE: Record<Market, TapeItem[]> = {
  IN: [
    { id: 'IX:NIFTY', label: 'NIFTY 50' },
    { id: 'IX:SENSEX', label: 'SENSEX' },
    { id: 'IX:BANKNIFTY', label: 'BANK NIFTY' },
    { id: 'IX:NIFTYIT', label: 'NIFTY IT' },
    { id: 'IX:MIDCAP', label: 'MIDCAP 100' },
    { id: 'IX:INDIAVIX', label: 'INDIA VIX' },
    { id: 'IX:USDINR', label: 'USD/INR' },
    { id: 'IX:BRENT', label: 'BRENT', unit: '$' },
    { id: 'IX:GOLD', label: 'GOLD', unit: '$' },
  ],
  US: [
    { id: 'IX:SPX', label: 'S&P 500' },
    { id: 'IX:NASDAQ', label: 'NASDAQ' },
    { id: 'IX:DOW', label: 'DOW 30' },
    { id: 'IX:VIX', label: 'VIX' },
    { id: 'IX:US10Y', label: 'US 10Y', suffix: '%' },
    { id: 'IX:BRENT', label: 'BRENT', unit: '$' },
    { id: 'IX:GOLD', label: 'GOLD', unit: '$' },
  ],
};

/** The headline index and its volatility gauge per market. */
export const HEADLINE: Record<Market, { id: string; name: string; vix: string; vixName: string }> = {
  IN: { id: 'IX:NIFTY', name: 'NIFTY 50', vix: 'IX:INDIAVIX', vixName: 'India VIX' },
  US: { id: 'IX:SPX', name: 'S&P 500', vix: 'IX:VIX', vixName: 'VIX' },
};

/** Regular session in exchange-local minutes and time zone. */
const SESSION: Record<Market, { tz: string; open: number; close: number; label: string }> = {
  IN: { tz: 'Asia/Kolkata', open: 9 * 60 + 15, close: 15 * 60 + 30, label: 'NSE & BSE' },
  US: { tz: 'America/New_York', open: 9 * 60 + 30, close: 16 * 60, label: 'NYSE & Nasdaq' },
};

export interface SessionInfo {
  open: boolean;
  /** 0–1 through today's session (clamped). */
  progress: number;
  minutesLeft: number;
  openLabel: string;
  closeLabel: string;
  exchanges: string;
  dateLabel: string;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** Session clock from the wall time. Holidays aren't known here, so callers prefer a live quote's marketOpen flag. */
export function sessionInfo(market: Market, now = new Date()): SessionInfo {
  const s = SESSION[market];
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: s.tz, hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const mins = (Number(get('hour')) % 24) * 60 + Number(get('minute'));
  const weekend = ['Sat', 'Sun'].includes(get('weekday'));
  const open = !weekend && mins >= s.open && mins < s.close;
  return {
    open,
    progress: weekend ? 0 : Math.max(0, Math.min(1, (mins - s.open) / (s.close - s.open))),
    minutesLeft: open ? s.close - mins : 0,
    openLabel: hhmm(s.open),
    closeLabel: hhmm(s.close),
    exchanges: s.label,
    dateLabel: now.toLocaleDateString('en-IN', { timeZone: s.tz, weekday: 'long', day: 'numeric', month: 'long' }),
  };
}
