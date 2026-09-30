'use client';

import { CheckCircle, CircleHalf, ClockCountdown, FilePdf, MicrosoftExcelLogo, Plus, Receipt } from '@phosphor-icons/react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { ContraventionHeader, ContraventionRows } from '@/components/ContraventionRows';
import { Button, Chip, Empty, ErrorBanner, PageHeader, Pagination, SearchInput, StatTile } from '@/components/ui/primitives';
import { api, qs } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useDebounced, useExport, useZones } from '@/lib/hooks';
import { useOverlay } from '@/lib/overlay-store';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { Contravention, Page } from '@/lib/types';

const PER_PAGE = 8;
const CHIPS: [string, string][] = [
  ['all', 'Toutes'],
  ['impayee', 'Impayées'],
  ['partielle', 'Partielles'],
  ['payee', 'Payées'],
  ['annulee', 'Annulées'],
];

export default function ContraventionsPage() {
  const { me } = useSession();
  const { openModal } = useOverlay();
  const zones = useZones();
  const exp = useExport();
  const [q, setQ] = useState('');
  const [statut, setStatut] = useState('all');
  const [zone, setZone] = useState('all');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const filters = { q: search, statut, zone_id: zone };

  const list = useQuery({
    queryKey: ['contraventions', filters, page],
    queryFn: () => api<Page<Contravention>>(`/contraventions${qs({ ...filters, page, per_page: PER_PAGE })}`),
    placeholderData: keepPreviousData,
  });
  const counts = useQuery({ queryKey: ['counts'], queryFn: () => api<Record<string, number>>('/contraventions/counts') });
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / PER_PAGE));
  const reset = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Registre des contraventions"
        subtitle={`${fmt(list.data?.total ?? 0)} contravention(s)${search || statut !== 'all' || zone !== 'all' ? ' · filtres actifs' : ''}`}
        actions={
          <>
            <Button icon={MicrosoftExcelLogo} loading={exp.busy?.includes('xlsx')} onClick={() => exp.run(`/exports/contraventions.xlsx${qs(filters)}`, 'contraventions.xlsx')}>
              Excel
            </Button>
            <Button icon={FilePdf} loading={exp.busy?.includes('pdf')} onClick={() => exp.run(`/exports/contraventions.pdf${qs(filters)}`, 'contraventions.pdf')}>
              PDF
            </Button>
            {can(me?.role, 'emit') && (
              <Button kind="primary" icon={Plus} onClick={() => openModal({ type: 'contravention' })}>
                Contravention manuelle
              </Button>
            )}
          </>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatTile icon={Receipt} bg="#E7F7EF" color="#16A86E" value={fmt(counts.data?.total)} label="Dans le registre" loading={!counts.data} />
        <StatTile icon={ClockCountdown} bg="#FDEDEE" color="#E84A57" value={fmt(counts.data?.impayee)} label="Impayées" loading={!counts.data} />
        <StatTile icon={CircleHalf} bg="#FBF0DF" color="#DB8B2A" value={fmt(counts.data?.partielle)} label="Partielles" loading={!counts.data} />
        <StatTile icon={CheckCircle} bg="#E7F7EF" color="#0E8C57" value={fmt(counts.data?.payee)} label="Payées" loading={!counts.data} />
      </div>
      {list.error && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-line-3 px-[18px] py-3.5">
          <SearchInput value={q} onChange={reset(setQ)} placeholder="N°, plaque ou officier…" />
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map(([id, l]) => (
              <Chip key={id} on={statut === id} onClick={() => reset(setStatut)(id)}>
                {l}
              </Chip>
            ))}
          </div>
          {!me?.zone && (
            <select className="select-base ml-auto" value={zone} onChange={(e) => reset(setZone)(e.target.value)}>
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
          <div className={`min-w-[1060px] transition-opacity ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            <ContraventionHeader />
            <ContraventionRows rows={list.data?.data} loading={list.isLoading} perPage={PER_PAGE} />
            {list.data && !list.data.data.length && <Empty>Aucune contravention ne correspond à ces filtres</Empty>}
          </div>
        </div>
        <Pagination page={page} pages={pages} total={list.data?.total ?? 0} onChange={setPage} />
      </div>
    </>
  );
}
