import clsx from 'clsx';
import type { ReactNode } from 'react';

export type Tone = 'up' | 'down' | 'warn' | 'brand' | 'neutral';

const toneCls: Record<Tone, string> = {
  up: 'bg-up/10 text-up ring-transparent',
  down: 'bg-down/10 text-down ring-transparent',
  warn: 'bg-warn/10 text-warn ring-transparent',
  brand: 'bg-brand/10 text-brand ring-transparent',
  neutral: 'bg-muted text-fg2 ring-line',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={clsx('inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-[0.78125rem] font-semibold ring-1 ring-inset whitespace-nowrap', toneCls[tone], className)}>
      {children}
    </span>
  );
}

export function SectionHeader({ title, subtitle, right, id }: { title: string; subtitle?: string; right?: ReactNode; id?: string }) {
  return (
    <div id={id} className="mb-4 flex flex-wrap items-end justify-between gap-3 scroll-mt-32">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-sub">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={clsx('mt-1.5 truncate text-lg font-semibold num', tone === 'up' && 'text-up', tone === 'down' && 'text-down', tone === 'warn' && 'text-warn')}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-sub">{hint}</div>}
    </div>
  );
}

export function ScoreRing({ score, size = 64, label }: { score: number; size?: number; label?: string }) {
  const r = (size - 8) / 2;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? 'text-up' : score >= 55 ? 'text-brand' : score >= 45 ? 'text-warn' : 'text-down';
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={`Score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="stroke-muted" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} fill="none" strokeLinecap="round" stroke="currentColor" className={clsx(color, 'transition-all duration-700')} strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} />
      </svg>
      <div className="absolute flex flex-col items-center leading-none">
        <span className="num text-base font-bold" style={{ fontSize: size * 0.28 }}>{score}</span>
        {label && <span className="mt-0.5 text-[0.625rem] text-sub">{label}</span>}
      </div>
    </div>
  );
}

export function Bar({ value, tone = 'brand' }: { value: number; tone?: Tone }) {
  const cls = { up: 'bg-up', down: 'bg-down', warn: 'bg-warn', brand: 'bg-brand', neutral: 'bg-sub' }[tone];
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className={clsx('h-full rounded-full transition-all duration-700', cls)} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}

export const scoreTone = (s: number): Tone => (s >= 70 ? 'up' : s >= 55 ? 'brand' : s >= 45 ? 'warn' : 'down');

export function Segmented<T extends string>({ options, value, onChange, size = 'md' }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div className="seg" role="group">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('seg-btn', size === 'sm' ? 'sm:!h-6 sm:!px-2 sm:!text-xs' : '', value === o.value && 'seg-on')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BulletList({ items, tone }: { items: string[]; tone: Tone }) {
  const dot = { up: 'bg-up', down: 'bg-down', warn: 'bg-warn', brand: 'bg-brand', neutral: 'bg-sub' }[tone];
  return (
    <ul className="space-y-2.5">
      {items.map((t) => (
        <li key={t} className="flex gap-3 text-sm leading-relaxed">
          <span className={clsx('mt-2 h-1.5 w-1.5 shrink-0 rounded-full', dot)} />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card card-pad flex flex-col items-center py-14 text-center">
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 max-w-sm text-sm text-sub">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** 10-step score bar (0–100), D-style. */
export function SegBar({ score }: { score: number }) {
  const on = Math.round(score / 10);
  const color = score >= 65 ? 'bg-up' : score >= 45 ? 'bg-warn' : 'bg-down';
  return (
    <span className="grid w-28 shrink-0 grid-cols-10 gap-0.5" role="img" aria-label={`${score} out of 100`}>
      {Array.from({ length: 10 }, (_, i) => <i key={i} className={clsx('h-2 rounded-[1.5px]', i < on ? color : 'bg-line')} />)}
    </span>
  );
}

/** Conviction as a 3-step meter. */
export function ConvictionMeter({ level }: { level: 'High' | 'Medium' | 'Low' }) {
  const n = level === 'High' ? 3 : level === 'Medium' ? 2 : 1;
  return (
    <span className="flex gap-[3px]" role="img" aria-label={`${level} conviction`}>
      {[0, 1, 2].map((i) => <i key={i} className={clsx('h-1.5 w-4 rounded-sm', i < n ? 'bg-up' : 'bg-line2')} />)}
    </span>
  );
}

export function CardHead({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="card-head">
      <h2 className="card-title">{title}{sub && <span className="ml-2 text-[0.8125rem] font-normal text-sub">{sub}</span>}</h2>
      {right}
    </div>
  );
}
