'use client';

import { ChartLineUp, CheckCircle, Eye, PoliceCar, Prohibit, UserPlus } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Chip, cx, Empty, ErrorBanner, PageHeader, Pill, SearchInput, SkeletonRows, StatTile } from '@/components/ui/primitives';
import { api, post, qs } from '@/lib/api';
import { fmt, fmtM, initials } from '@/lib/format';
import { useDebounced, useZones } from '@/lib/hooks';
import { useOverlay } from '@/lib/overlay-store';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { OfficerRow } from '@/lib/types';

const COLS = 'minmax(230px,1.6fr) 100px 110px 130px 100px 90px 120px 180px';
const STATUS = {
  actif: { label: 'Actif', color: '#0E8C57', bg: '#E7F7EF' },
  suspendu: { label: 'Suspendu', color: '#C93642', bg: '#FDEDEE' },
  inactif: { label: 'Inactif', color: '#6E8378', bg: '#EEF2EF' },
};

export default function OfficiersPage() {
  const { me } = useSession();
  const { openDrawer, openModal } = useOverlay();
  const qc = useQueryClient();
  const zones = useZones();
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('all');
  const [zone, setZone] = useState('all');
  const search = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ['officers', search, statut, zone],
    queryFn: () => api<{ data: OfficerRow[]; total: number }>(`/officers${qs({ q: search, statut, zone_id: zone })}`),
  });
  const stats = useQuery({
    queryKey: ['officers', 'stats'],
    queryFn: () => api<{ total: number; actifs: number; suspendus: number; amendesParAgentJour: number; enLigne: number }>('/officers/stats'),
  });
  // Réactivation directe ; la suspension passe par la modale (motif obligatoire).
  const reactivate = useMutation({
    mutationFn: (o: OfficerRow) => post(`/officers/${o.id}/reactivate`),
    onSuccess: (_d, o) => toast.success(`${o.nomComplet} réactivé`),
    onError: (e) => toast.error((e as Error).message),
    onSettled: () => qc.invalidateQueries({ queryKey: ['officers'] }),
  });
  const manage = can(me?.role, 'manageOfficers');
  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Officiers"
        subtitle={s ? `${fmt(s.total)} agents · ${fmt(s.actifs)} actifs · ${s.enLigne} en ligne` : ' '}
        actions={
          manage && (
            <Button kind="primary" icon={UserPlus} onClick={() => openModal({ type: 'officer' })}>
              Ajouter un officier
            </Button>
          )
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatTile icon={PoliceCar} bg="#E7F7EF" color="#16A86E" value={fmt(s?.total)} label="Officiers enregistrés" loading={!s} />
        <StatTile icon={CheckCircle} bg="#E7F7EF" color="#0E8C57" value={fmt(s?.actifs)} label="Actifs sur le terrain" loading={!s} />
        <StatTile icon={Prohibit} bg="#FDEDEE" color="#E84A57" value={fmt(s?.suspendus)} label="Suspendus" loading={!s} />
        <StatTile icon={ChartLineUp} bg="#EEF3EF" color="#0E6B47" value={String(s?.amendesParAgentJour ?? '').replace('.', ',')} label="Amendes / agent / jour" loading={!s} />
      </div>
      {list.error && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-3 px-[18px] py-3.5">
          <SearchInput value={q} onChange={setQ} placeholder="Nom ou matricule…" />
          <div className="flex flex-wrap gap-1.5">
            {[
              ['all', 'Tous'],
              ['actif', 'Actifs'],
              ['suspendu', 'Suspendus'],
            ].map(([id, l]) => (
              <Chip key={id} on={statut === id} onClick={() => setStatut(id)}>
                {l}
              </Chip>
            ))}
          </div>
          {!me?.zone && (
            <select className="select-base ml-auto" value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="all">Toutes les zones</option>
              {zones.data?.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.nom}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="scroll-x">
          <div className="min-w-[1080px]">
            <div className="th grid gap-3" style={{ gridTemplateColumns: COLS }}>
              <span>Officier</span>
              <span>Matricule</span>
              <span>Grade</span>
              <span>Zone</span>
              <span>Statut</span>
              <span>Amendes</span>
              <span>Collecté</span>
              <span>Actions</span>
            </div>
            {list.isLoading && <SkeletonRows rows={8} cols={COLS} />}
            {list.data?.data.slice(0, 200).map((o) => {
              const susp = o.statut === 'suspendu';
              return (
                <div key={o.id} className="tr grid items-center gap-3 py-3" style={{ gridTemplateColumns: COLS }}>
                  <div className="flex min-w-0 items-center gap-[11px]">
                    <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] bg-mint text-[13px] font-extrabold text-brand-600">{initials(o.nomComplet)}</div>
                    <div className="min-w-0">
                      <div className="truncate font-extrabold">{o.nomComplet}</div>
                      <div className="truncate text-[11.5px] font-semibold text-faint">{o.email ?? '—'}</div>
                    </div>
                  </div>
                  <span className="font-mono text-[12.5px] font-bold">{o.matricule}</span>
                  <span className="font-semibold text-ink-2">{o.grade}</span>
                  <span className="truncate font-semibold text-ink-2">{o.zone}</span>
                  <span title={o.suspensionMotif ? `Motif : ${o.suspensionMotif}` : undefined} className="justify-self-start">
                    <Pill color={STATUS[o.statut].color} bg={STATUS[o.statut].bg}>
                      {STATUS[o.statut].label}
                    </Pill>
                  </span>
                  <span className="font-mono font-extrabold">{fmt(o.amendes)}</span>
                  <span className="font-mono font-extrabold text-brand-600">{fmtM(o.collecte)} F</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => openDrawer({ type: 'officer', id: o.id })}
                      className="flex h-8 cursor-pointer items-center gap-[5px] rounded-[9px] border-[1.5px] border-line-2 px-[11px] text-[12px] font-extrabold hover:bg-hover"
                    >
                      <Eye /> Voir
                    </button>
                    {manage && o.statut !== 'inactif' && (
                      <button
                        onClick={() => (susp ? reactivate.mutate(o) : openModal({ type: 'suspend', officer: { id: o.id, nomComplet: o.nomComplet } }))}
                        className={cx(
                          'flex h-8 cursor-pointer items-center rounded-[9px] px-[11px] text-[12px] font-extrabold',
                          susp ? 'bg-mint text-brand-600' : 'bg-danger-bg text-danger-ink',
                        )}
                      >
                        {susp ? 'Réactiver' : 'Suspendre'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {list.data && !list.data.data.length && <Empty>Aucun officier ne correspond</Empty>}
          </div>
        </div>
        {list.data && list.data.total > 200 && (
          <div className="border-t border-line-3 px-5 py-3 text-[12.5px] font-bold text-muted">200 premiers sur {fmt(list.data.total)} · affinez la recherche</div>
        )}
      </div>
    </>
  );
}
