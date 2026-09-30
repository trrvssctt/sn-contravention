'use client';

import { Icon, MagnifyingGlass, CaretLeft, CaretRight } from '@phosphor-icons/react';
import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';
import type { Statut } from '@/lib/types';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

/* ── Pastilles ─────────────────────────────────────────────────────────────── */

export const STATUT_META: Record<Statut, { label: string; color: string; bg: string }> = {
  payee: { label: 'Payée', color: '#0E8C57', bg: '#E7F7EF' },
  impayee: { label: 'Impayée', color: '#C93642', bg: '#FDEDEE' },
  partielle: { label: 'Partielle', color: '#B4701A', bg: '#FBF0DF' },
  annulee: { label: 'Annulée', color: '#6E8378', bg: '#EEF2EF' },
};

export function Pill({ color, bg, children, className, size = 'md' }: { color: string; bg: string; children: React.ReactNode; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 justify-self-start rounded-[20px] font-extrabold whitespace-nowrap',
        size === 'sm' && 'px-2 py-0.5 text-[10.5px]',
        size === 'md' && 'px-2.5 py-[3px] text-[11px]',
        size === 'lg' && 'px-3 py-[5px] text-[12px]',
        className,
      )}
      style={{ color, background: bg }}
    >
      {children}
    </span>
  );
}

export function StatusPill({ statut, size }: { statut: Statut; size?: 'sm' | 'md' | 'lg' }) {
  const m = STATUT_META[statut];
  return (
    <Pill color={m.color} bg={m.bg} size={size}>
      {m.label}
    </Pill>
  );
}

/* ── Boutons ───────────────────────────────────────────────────────────────── */

type BtnKind = 'primary' | 'ghost' | 'danger' | 'soft';

export function Button({
  kind = 'ghost',
  icon: I,
  children,
  className,
  loading,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; icon?: Icon; loading?: boolean }) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      className={cx(
        'inline-flex h-[42px] cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-[13.5px] font-extrabold whitespace-nowrap transition-[filter,background] disabled:cursor-not-allowed disabled:opacity-50',
        kind === 'primary' && 'grad-cta text-white shadow-cta hover:brightness-105',
        kind === 'ghost' && 'border-[1.5px] border-line-2 bg-white text-ink hover:bg-hover',
        kind === 'danger' && 'bg-danger-bg text-danger-ink hover:brightness-97',
        kind === 'soft' && 'bg-mint text-brand-600 hover:brightness-97',
        className,
      )}
      disabled={loading || rest.disabled}
      {...(rest as object)}
    >
      {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : I && <I weight="bold" size={16} />}
      {children}
    </motion.button>
  );
}

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex h-[34px] cursor-pointer items-center rounded-[10px] px-[13px] text-[12.5px] transition-colors',
        on ? 'bg-brand font-extrabold text-white' : 'bg-neutral font-bold text-ink-2 hover:bg-line-3',
      )}
    >
      {children}
    </button>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex gap-1 rounded-xl border border-line-2 bg-white p-1">
      {options.map(([id, label]) => (
        <button key={id} onClick={() => onChange(id)} className="relative h-[34px] cursor-pointer rounded-[9px] px-4 text-[13px]">
          {value === id && <motion.span layoutId={`seg-${options.map((o) => o[0]).join()}`} className="absolute inset-0 rounded-[9px] bg-brand" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />}
          <span className={cx('relative', value === id ? 'font-extrabold text-white' : 'font-bold text-ink-2')}>{label}</span>
        </button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      aria-pressed={on}
      className={cx('relative h-[26px] w-11 flex-none cursor-pointer rounded-[20px] transition-colors disabled:cursor-not-allowed', on ? 'bg-brand' : 'bg-[#D4DDD7]')}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
        className="absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.2)]"
        style={on ? { right: 3 } : { left: 3 }}
      />
    </button>
  );
}

/* ── Mise en page ──────────────────────────────────────────────────────────── */

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[26px] font-extrabold tracking-[-.4px]">{title}</h1>
        {subtitle && <div className="mt-[3px] text-[14px] font-semibold text-muted">{subtitle}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2.5">{actions}</div>}
    </div>
  );
}

export function CardTitle({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[15px] font-extrabold">{title}</div>
        {subtitle && <div className="text-[12.5px] font-semibold text-muted">{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function StatTile({ icon: I, value, label, color, bg, loading }: { icon: Icon; value: React.ReactNode; label: string; color: string; bg: string; loading?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-line bg-white px-4 py-3.5">
      <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]" style={{ background: bg }}>
        <I weight="fill" size={19} color={color} />
      </div>
      <div className="min-w-0">
        {loading ? <div className="skeleton h-5 w-16 rounded" /> : <div className="font-mono text-[18px] font-extrabold">{value}</div>}
        <div className="text-[11.5px] font-bold text-muted">{label}</div>
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder: string; className?: string }) {
  return (
    <div className={cx('flex h-10 max-w-[340px] flex-[1_1_240px] items-center gap-[9px] rounded-[11px] border border-line-2 bg-head px-3 focus-within:border-brand focus-within:bg-white', className)}>
      <MagnifyingGlass size={17} color="#9CB0A4" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-none bg-transparent text-[13.5px] font-semibold text-ink outline-none placeholder:text-faint-2"
      />
    </div>
  );
}

export function Pagination({ page, pages, total, onChange }: { page: number; pages: number; total: number; onChange: (p: number) => void }) {
  const btn = (en: boolean) => cx('flex h-9 items-center gap-1.5 rounded-[10px] border-[1.5px] border-line-2 px-[13px] text-[12.5px] font-extrabold', en ? 'cursor-pointer text-ink hover:bg-hover' : 'cursor-default text-disabled');
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line-3 px-[18px] py-3">
      <span className="text-[12.5px] font-bold text-muted">
        Page {page} / {Math.max(1, pages)} · {total.toLocaleString('fr-FR')} résultats
      </span>
      <div className="flex gap-2">
        <button className={btn(page > 1)} disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <CaretLeft weight="bold" /> Précédent
        </button>
        <button className={btn(page < pages)} disabled={page >= pages} onClick={() => onChange(page + 1)}>
          Suivant <CaretRight weight="bold" />
        </button>
      </div>
    </div>
  );
}

export function Empty({ icon: I = MagnifyingGlass, children }: { icon?: Icon; children: React.ReactNode }) {
  return (
    <div className="border-t border-line-3 p-10 text-center text-[14px] font-bold text-faint">
      <I size={28} className="mx-auto mb-2" />
      {children}
    </div>
  );
}

export function SkeletonRows({ rows = 6, cols }: { rows?: number; cols: string }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="tr grid items-center gap-3" style={{ gridTemplateColumns: cols }}>
          {cols.split(' ').map((_, j) => (
            <div key={j} className="skeleton h-3.5 rounded" style={{ width: `${55 + ((i * 7 + j * 13) % 40)}%` }} />
          ))}
        </div>
      ))}
    </>
  );
}

export function ErrorBanner({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-danger-bg px-4 py-3 text-[13px] font-bold text-danger-ink">
      <span className="flex-1">Erreur de chargement : {(error as Error)?.message ?? 'réseau indisponible'}</span>
      {onRetry && (
        <button onClick={onRetry} className="cursor-pointer rounded-lg bg-white px-3 py-1.5 font-extrabold">
          Réessayer
        </button>
      )}
    </div>
  );
}

/** Nombre animé (compteur des KPI). */
export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.2, 0.8, 0.25, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

export function ProgressBar({ pct, color, height = 6, track = '#EEF3EF' }: { pct: number; color: string; height?: number; track?: string }) {
  return (
    <div className="overflow-hidden rounded-full" style={{ height, background: track }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        transition={{ duration: 0.8, ease: [0.2, 0.8, 0.25, 1] }}
      />
    </div>
  );
}

export function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <label className={cx('flex flex-col gap-[7px] text-[11.5px] font-extrabold tracking-[.4px] text-muted', full && 'col-span-full')}>
      {label}
      {children}
    </label>
  );
}

export const inputCls =
  'h-[46px] rounded-xl border-[1.5px] border-line-2 bg-field px-3.5 text-[14px] font-semibold tracking-normal text-ink outline-none transition-colors focus:border-brand focus:bg-white';
