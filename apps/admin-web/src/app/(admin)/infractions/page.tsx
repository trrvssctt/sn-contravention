'use client';

import { Plus, Trash } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';
import { infractionIcon } from '@/components/infractionIcon';
import { Button, cx, ErrorBanner, PageHeader, SkeletonRows, Toggle } from '@/components/ui/primitives';
import { api, del, patch } from '@/lib/api';
import { fmt, fmtM } from '@/lib/format';
import { useOverlay } from '@/lib/overlay-store';
import type { InfractionType } from '@/lib/types';

const COLS = 'minmax(250px,1.6fr) 190px 120px 150px 90px 50px';
const KEY = ['infractions', 'stats'];

export default function InfractionsPage() {
  const qc = useQueryClient();
  const { openModal } = useOverlay();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const list = useQuery({ queryKey: KEY, queryFn: () => api<InfractionType[]>('/infraction-types/stats') });

  // Mutations optimistes : l'UI réagit immédiatement, l'API diffuse ensuite `infraction_types.updated` aux terminaux.
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InfractionType> }) => patch(`/infraction-types/${id}`, data),
    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: KEY });
      const prev = qc.getQueryData<InfractionType[]>(KEY);
      qc.setQueryData<InfractionType[]>(KEY, (d) => d?.map((x) => (x.id === id ? { ...x, ...data } : x)));
      return { prev };
    },
    onError: (e, _v, ctx) => {
      qc.setQueryData(KEY, ctx?.prev);
      toast.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['infractions'] }),
  });
  const remove = useMutation({
    mutationFn: (f: InfractionType) => del(`/infraction-types/${f.id}`),
    onMutate: async (f) => {
      const prev = qc.getQueryData<InfractionType[]>(KEY);
      qc.setQueryData<InfractionType[]>(KEY, (d) => d?.filter((x) => x.id !== f.id));
      return { prev };
    },
    onSuccess: (_d, f) => toast.success(`« ${f.libelle} » supprimée du barème`),
    onError: (e, _f, ctx) => {
      qc.setQueryData(KEY, ctx?.prev);
      toast.error((e as Error).message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['infractions'] }),
  });

  const saveAmount = (f: InfractionType) => {
    const raw = drafts[f.id];
    if (raw === undefined) return;
    const v = Number(raw.replace(/[^\d]/g, ''));
    setDrafts(({ [f.id]: _, ...rest }) => rest);
    if (!v || v === f.montantDefaut) return;
    update.mutate({ id: f.id, data: { montantDefaut: v } }, { onSuccess: () => toast.success(`Montant « ${f.libelle} » mis à jour · ${fmt(v)} F`, { description: 'Synchronisé sur les terminaux mobiles' }) });
  };

  return (
    <>
      <PageHeader
        title="Barème des infractions"
        subtitle="Montants par défaut appliqués sur les terminaux mobiles · modifications synchronisées en temps réel"
        actions={
          <Button kind="primary" icon={Plus} onClick={() => openModal({ type: 'infraction' })}>
            Ajouter une infraction
          </Button>
        }
      />
      {list.error && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
      <div className="card overflow-hidden">
        <div className="scroll-x">
          <div className="min-w-[900px]">
            <div className="th grid gap-3" style={{ gridTemplateColumns: COLS }}>
              <span>Infraction</span>
              <span>Montant par défaut</span>
              <span>Émises (mois)</span>
              <span>Recettes (mois)</span>
              <span>Active</span>
              <span />
            </div>
            {list.isLoading && <SkeletonRows rows={8} cols={COLS} />}
            <AnimatePresence initial={false}>
              {list.data?.map((f) => {
                const I = infractionIcon(f.icone);
                return (
                  <motion.div
                    key={f.id}
                    layout
                    exit={{ opacity: 0, x: -20, height: 0, paddingTop: 0, paddingBottom: 0 }}
                    className={cx('tr grid items-center gap-3 py-3 transition-opacity', !f.actif && 'opacity-50')}
                    style={{ gridTemplateColumns: COLS }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-mint">
                        <I weight="fill" size={20} color="#16A86E" />
                      </div>
                      <div>
                        <div className="font-extrabold">{f.libelle}</div>
                        <div className="font-mono text-[11px] font-bold text-faint">{f.code}</div>
                      </div>
                    </div>
                    <div className="flex h-10 max-w-[170px] items-center rounded-[11px] border-[1.5px] border-line-2 bg-field px-3 focus-within:border-brand focus-within:bg-white">
                      <input
                        value={drafts[f.id] ?? String(f.montantDefaut)}
                        onChange={(e) => setDrafts((d) => ({ ...d, [f.id]: e.target.value.replace(/[^\d]/g, '') }))}
                        onBlur={() => saveAmount(f)}
                        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                        inputMode="numeric"
                        aria-label={`Montant ${f.libelle}`}
                        className="w-full min-w-0 bg-transparent font-mono text-[14px] font-extrabold text-ink outline-none"
                      />
                      <span className="text-[12px] font-extrabold text-faint-2">FCFA</span>
                    </div>
                    <span className="font-mono font-extrabold">{fmt(f.emisesMois)}</span>
                    <span className="font-mono font-extrabold text-brand-600">{fmtM(f.recettesMois)} F</span>
                    <Toggle
                      on={f.actif}
                      onChange={() =>
                        update.mutate(
                          { id: f.id, data: { actif: !f.actif } },
                          { onSuccess: () => toast.success(`${f.libelle} ${f.actif ? 'désactivée' : 'activée'} sur les terminaux`) },
                        )
                      }
                    />
                    <button
                      onClick={() => {
                        if (confirm(`Supprimer « ${f.libelle} » du barème ? Les contraventions existantes sont conservées.`)) remove.mutate(f);
                      }}
                      className="flex h-[34px] w-[34px] cursor-pointer items-center justify-center rounded-[10px] text-danger-ink hover:bg-danger-bg"
                      aria-label={`Supprimer ${f.libelle}`}
                    >
                      <Trash size={18} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </>
  );
}
