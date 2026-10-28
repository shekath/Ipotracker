import type React from 'react';
import type { Market } from '../types';

/**
 * Inline SVG flags. Emoji flags (🇮🇳 🇺🇸) don't render on Windows, where they
 * show as plain letters, so the app draws its own.
 */
export function Flag({ market, className = 'h-3.5 w-5' }: { market: Market; className?: string }) {
  const label = market === 'IN' ? 'India' : 'United States';
  return (
    <svg viewBox="0 0 30 20" className={`inline-block shrink-0 overflow-hidden rounded-[3px] ring-1 ring-black/10 ${className}`} role="img" aria-label={label}>
      <title>{label}</title>
      {market === 'IN' ? <India /> : <USA />}
    </svg>
  );
}

function India() {
  const spokes = Array.from({ length: 24 }, (_, i) => (i * 360) / 24);
  return (
    <>
      <rect width="30" height="6.67" fill="#FF9933" />
      <rect y="6.67" width="30" height="6.67" fill="#FFFFFF" />
      <rect y="13.33" width="30" height="6.67" fill="#138808" />
      <g transform="translate(15 10)" stroke="#000080" fill="none">
        <circle r="2.6" strokeWidth="0.45" />
        {spokes.map((a) => (
          <line key={a} x1="0" y1="0" x2="0" y2="-2.6" strokeWidth="0.2" transform={`rotate(${a})`} />
        ))}
        <circle r="0.45" fill="#000080" stroke="none" />
      </g>
    </>
  );
}

function USA() {
  const stripes = Array.from({ length: 13 }, (_, i) => i);
  const stars: [number, number][] = [];
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6 - (r % 2); c++) stars.push([1.1 + c * 2.1 + (r % 2) * 1.05, 1.2 + r * 1.95]);
  return (
    <>
      {stripes.map((i) => (
        <rect key={i} y={(i * 20) / 13} width="30" height={20 / 13} fill={i % 2 ? '#FFFFFF' : '#B22234'} />
      ))}
      <rect width="13" height={(20 / 13) * 7} fill="#3C3B6E" />
      {stars.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="0.42" fill="#FFFFFF" />
      ))}
    </>
  );
}

export const marketTabs: { value: Market; label: React.ReactNode }[] = [
  { value: 'IN', label: <span className="inline-flex items-center gap-2"><Flag market="IN" /> India</span> },
  { value: 'US', label: <span className="inline-flex items-center gap-2"><Flag market="US" /> US</span> },
];
