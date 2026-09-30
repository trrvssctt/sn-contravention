'use client';

import { CaretRight, CarProfile, FileX, PlusCircle, Plus, Siren } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { vehicleIcon } from '@/components/vehicleIcon';
import { Button, CardTitle, Chip, Empty, ErrorBanner, PageHeader, Pagination, Pill, ProgressBar, SearchInput, SkeletonRows, StatTile } from '@/components/ui/primitives';
import { api, qs } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useOverlay } from '@/lib/overlay-store';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { Page, VehicleRow, VehicleType } from '@/lib/types';

const COLS = '130px minmax(170px,1.2fr) 100px minmax(150px,1fr) 90px 190px 100px 20px';
const PER_PAGE = 10;
const TYPE_LABEL: Record<VehicleType, string> = { VP: 'Voitures particulières', Moto: 'Motos', Camion: 'Camions', Bus: 'Bus & cars' };

interface Stats {
  total: number;
  enAlerte: number;
  documentsExpires: number;
  enrolesCeMois: number;
  parType: { type: VehicleType; count: number; pct: number }[];
  conformite: { code: string; label: string; pct: number; nonConformes: number }[];
  marques: { marque: string; count: number; pct: number }[];
}

export default function VehiculesPage() {
  const { me } = useSession();
  const { openDrawer, openModal } = useOverlay();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ['vehicles', search, filter, page],
    queryFn: () => api<Page<VehicleRow>>(`/vehicles${qs({ q: search, filter, page, per_page: PER_PAGE })}`),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({ queryKey: ['vehicles', 'stats'], queryFn: () => api<Stats>('/vehicles/stats') });
  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Véhicules & analyse"
        subtitle="Fichier national des immatriculations"
        actions={
          can(me?.role, 'emit') && (
            <Button kind="primary" icon={Plus} onClick={() => openModal({ type: 'vehicle' })}>
              Enregistrer un véhicule
            </Button>
          )
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatTile icon={CarProfile} bg="#E7F7EF" color="#16A86E" value={fmt(s?.total)} label="Véhicules enregistrés" loading={!s} />
        <StatTile icon={Siren} bg="#FDEDEE" color="#E84A57" value={fmt(s?.enAlerte)} label="Véhicules en alerte" loading={!s} />
        <StatTile icon={FileX} bg="#FBF0DF" color="#DB8B2A" value={fmt(s?.documentsExpires)} label="Documents expirés" loading={!s} />
        <StatTile icon={PlusCircle} bg="#E7F7EF" color="#0E8C57" value={fmt(s?.enrolesCeMois)} label="Enrôlés ce mois" loading={!s} />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-4">
        <div className="card p-5">
          <CardTitle title="Parc par type" />
          <div className="mt-3.5 flex flex-col gap-3">
            {s?.parType.map((t) => {
              const I = vehicleIcon(t.type);
              return (
                <div key={t.type} className="flex items-center gap-[11px]">
                  <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-mint">
                    <I weight="fill" size={18} color="#16A86E" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-[13px] font-bold">
                      <span>{TYPE_LABEL[t.type]}</span>
                      <span className="font-mono font-extrabold">{fmt(t.count)}</span>
                    </div>
                    <div className="mt-1.5">
                      <ProgressBar pct={t.pct} color="#16A86E" height={7} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-5">
          <CardTitle title="Conformité des documents" />
          <div className="mt-3.5 flex flex-col gap-4">
            {s?.conformite.map((c) => {
              const color = c.pct >= 85 ? '#16A86E' : '#DB8B2A';
              return (
                <div key={c.code}>
                  <div className="flex justify-between text-[13px] font-bold">
                    <span>{c.label}</span>
                    <span className="font-mono font-extrabold" style={{ color }}>
                      {c.pct}%
                    </span>
                  </div>
                  <div className="mt-[7px]">
                    <ProgressBar pct={c.pct} color={color} height={9} track="#FDEDEE" />
                  </div>
                  <div className="mt-[5px] text-[11.5px] font-semibold text-faint">
                    {fmt(c.nonConformes)} {c.code === 'ASS' ? 'véhicules non assurés' : c.code === 'VT' ? 'visites expirées' : 'anomalies'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="card p-5">
          <CardTitle title="Marques les plus verbalisées" subtitle="Ce mois" />
          <div className="mt-2.5 flex flex-col">
            {s?.marques.map((b, i) => (
              <div key={b.marque} className="flex items-center gap-[11px] border-t border-line-3 py-[9px]">
                <span className="w-[18px] font-mono text-[12px] font-extrabold text-faint-2">{i + 1}</span>
                <span className="flex-1 text-[13.5px] font-extrabold">{b.marque}</span>
                <span className="font-mono text-[12.5px] font-extrabold">{fmt(b.count)}</span>
                <span className="rounded-[20px] bg-mint px-2 py-0.5 text-[11px] font-extrabold text-brand-600">{b.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {list.error && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-3 px-[18px] py-3.5">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Plaque, marque ou propriétaire…"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              ['all', 'Tous'],
              ['alert', 'En alerte'],
              ['ok', 'RAS'],
            ].map(([id, l]) => (
              <Chip
                key={id}
                on={filter === id}
                onClick={() => {
                  setFilter(id);
                  setPage(1);
                }}
              >
                {l}
              </Chip>
            ))}
          </div>
        </div>
        <div className="scroll-x">
          <div className={`min-w-[980px] ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            <div className="th grid gap-3" style={{ gridTemplateColumns: COLS }}>
              <span>Plaque</span>
              <span>Véhicule</span>
              <span>Type</span>
              <span>Propriétaire</span>
              <span>Amendes</span>
              <span>Documents</span>
              <span>Statut</span>
              <span />
            </div>
            {list.isLoading && <SkeletonRows rows={PER_PAGE} cols={COLS} />}
            {list.data?.data.map((v) => {
              const I = vehicleIcon(v.type);
              return (
                <div
                  key={v.id}
                  onClick={() => openDrawer({ type: 'vehicle', id: v.plaque })}
                  className="tr grid cursor-pointer items-center gap-3 py-3 hover:bg-hover"
                  style={{ gridTemplateColumns: COLS }}
                >
                  <span className="font-mono text-[13px] font-extrabold">{v.plaque}</span>
                  <div className="min-w-0">
                    <div className="truncate font-extrabold">
                      {v.marque} {v.modele}
                    </div>
                    <div className="text-[11.5px] font-semibold text-faint">
                      {v.couleur ?? '—'} · {v.annee ?? '—'}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 font-semibold text-ink-2">
                    <I weight="fill" color="#16A86E" />
                    {v.typeLabel}
                  </span>
                  <span className="truncate font-semibold text-ink-2">{v.proprietaire}</span>
                  <span className="font-mono font-extrabold">{v.contraventions}</span>
                  <div className="flex gap-[5px]">
                    {v.documents.map((d) => (
                      <span
                        key={d.code}
                        title={`${d.label} : ${d.ok ? 'à jour' : 'expiré'}`}
                        className="rounded-[7px] px-[7px] py-[3px] text-[10.5px] font-extrabold"
                        style={d.ok ? { color: '#0E8C57', background: '#E7F7EF' } : { color: '#C93642', background: '#FDEDEE' }}
                      >
                        {d.code}
                      </span>
                    ))}
                  </div>
                  <Pill color={v.alerte ? '#C93642' : '#0E8C57'} bg={v.alerte ? '#FDEDEE' : '#E7F7EF'}>
                    {v.alerte ? 'Alerte' : 'RAS'}
                  </Pill>
                  <CaretRight weight="bold" color="#bcccc1" />
                </div>
              );
            })}
            {list.data && !list.data.data.length && <Empty>Aucun véhicule ne correspond</Empty>}
          </div>
        </div>
        <Pagination page={page} pages={Math.ceil((list.data?.total ?? 0) / PER_PAGE)} total={list.data?.total ?? 0} onChange={setPage} />
      </div>
    </>
  );
}
