'use client';

import { CaretRight } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { fmt, fmtDateTime } from '@/lib/format';
import { useOverlay } from '@/lib/overlay-store';
import { useRealtime } from '@/lib/realtime';
import type { Contravention } from '@/lib/types';
import { cx, SkeletonRows, StatusPill } from './ui/primitives';

export const C_COLS = '140px 130px 118px minmax(160px,1.3fr) minmax(150px,1fr) 120px 110px 96px 20px';

export function ContraventionHeader() {
  return (
    <div className="th grid gap-3" style={{ gridTemplateColumns: C_COLS }}>
      <span>N°</span>
      <span>Date</span>
      <span>Plaque</span>
      <span>Infraction</span>
      <span>Officier</span>
      <span>Zone</span>
      <span>Montant</span>
      <span>Statut</span>
      <span />
    </div>
  );
}

export function ContraventionRows({ rows, loading, perPage = 8 }: { rows?: Contravention[]; loading?: boolean; perPage?: number }) {
  const { openDrawer } = useOverlay();
  const { fresh } = useRealtime();
  if (loading && !rows) return <SkeletonRows rows={perPage} cols={C_COLS} />;
  return (
    <AnimatePresence initial={false}>
      {rows?.map((c) => (
        <motion.div
          key={c.id}
          layout="position"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => openDrawer({ type: 'contravention', id: c.id })}
          className={cx('tr grid cursor-pointer items-center gap-3 hover:bg-hover', fresh.has(c.numero) && 'row-flash')}
          style={{ gridTemplateColumns: C_COLS }}
        >
          <span className="font-mono text-[12.5px] font-bold text-brand-600">{c.numero}</span>
          <span className="text-[12.5px] font-semibold text-muted">{fmtDateTime(c.dateHeure)}</span>
          <span className="font-mono text-[13px] font-extrabold">{c.plaque}</span>
          <span className="truncate font-bold" title={c.infraction}>
            {c.infraction}
          </span>
          <span className="truncate font-semibold text-ink-2">{c.officier ?? 'Administration'}</span>
          <span className="truncate font-semibold text-ink-2">{c.zone}</span>
          <span className="font-mono font-extrabold">{fmt(c.montantTotal)} F</span>
          <StatusPill statut={c.statut} />
          <CaretRight weight="bold" color="#bcccc1" />
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
