import type { Market } from '../types';

export const currencySymbol = (m: Market) => (m === 'IN' ? '₹' : '$');

export function fmtPrice(v: number, m: Market): string {
  const locale = m === 'IN' ? 'en-IN' : 'en-US';
  return `${currencySymbol(m)}${v.toLocaleString(locale, { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1000 ? 2 : 0 })}`;
}

/** Market cap stored in local-currency billions. */
export function fmtMcap(billions: number, m: Market): string {
  if (m === 'IN') {
    const cr = billions * 100;
    if (cr >= 100000) return `₹${(cr / 100000).toFixed(2)} L Cr`;
    return `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
  }
  if (billions >= 1000) return `$${(billions / 1000).toFixed(2)} T`;
  return `$${billions.toFixed(0)} B`;
}

export function fmtCr(v: number): string {
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: v < 100 ? 2 : 0 })} Cr`;
}

export const finUnit = (m: Market) => (m === 'IN' ? '₹ Cr' : '$ B');

export function fmtFin(v: number, m: Market): string {
  return m === 'IN' ? v.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : v.toFixed(2);
}

export const pct = (v: number, digits = 1) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;

export const change = (from: number, to: number) => ((to - from) / from) * 100;

export function fmtDate(iso: string): string {
  const d = new Date(iso + (iso.length === 7 ? '-01' : '') + 'T00:00:00');
  return d.toLocaleDateString('en-IN', iso.length === 7 ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
}
