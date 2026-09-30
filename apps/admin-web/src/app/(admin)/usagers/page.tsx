'use client';

import { CaretRight, ChatCircleText, DeviceMobile, DeviceMobileSlash, HandCoins, Users, WarningCircle } from '@phosphor-icons/react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, Empty, ErrorBanner, PageHeader, Pagination, Pill, SearchInput, SkeletonRows, StatTile } from '@/components/ui/primitives';
import { api, post, qs } from '@/lib/api';
import { fmt, fmtM, initials } from '@/lib/format';
import { useDebounced } from '@/lib/hooks';
import { useOverlay } from '@/lib/overlay-store';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { OwnerRow, Page } from '@/lib/types';

const COLS = 'minmax(220px,1.5fr) 170px 130px 90px 90px 120px 130px 20px';
const PER_PAGE = 10;

export default function UsagersPage() {
  const { me } = useSession();
  const { openDrawer } = useOverlay();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const search = useDebounced(q.trim());
  const list = useQuery({
    queryKey: ['owners', search, page],
    queryFn: () => api<Page<OwnerRow>>(`/owners${qs({ q: search, page, per_page: PER_PAGE })}`),
    placeholderData: keepPreviousData,
  });
  const stats = useQuery({
    queryKey: ['owners', 'stats'],
    queryFn: () => api<{ proprietaires: number; comptesApp: number; avecImpayes: number; montantDu: number }>('/owners/stats'),
  });
  const remindAll = useMutation({
    mutationFn: () => post<{ queued: number }>('/owners/remind-all'),
    onSuccess: (r) => toast.success(`Relance SMS programmée · ${fmt(r.queued)} usagers avec impayés`),
    onError: (e) => toast.error((e as Error).message),
  });
  const s = stats.data;

  return (
    <>
      <PageHeader
        title="Usagers de la route"
        subtitle="Propriétaires enregistrés et comptes de l'application citoyenne"
        actions={
          can(me?.role, 'remind') && (
            <Button icon={ChatCircleText} loading={remindAll.isPending} onClick={() => remindAll.mutate()}>
              Relance SMS des impayés
            </Button>
          )
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <StatTile icon={Users} bg="#E7F7EF" color="#16A86E" value={fmt(s?.proprietaires)} label="Propriétaires enregistrés" loading={!s} />
        <StatTile icon={DeviceMobile} bg="#E7F7EF" color="#0E8C57" value={fmt(s?.comptesApp)} label="Comptes app citoyenne" loading={!s} />
        <StatTile icon={WarningCircle} bg="#FDEDEE" color="#E84A57" value={fmt(s?.avecImpayes)} label="Usagers avec impayés" loading={!s} />
        <StatTile icon={HandCoins} bg="#FBF0DF" color="#DB8B2A" value={s ? fmtM(s.montantDu) : ''} label="Montant dû (FCFA)" loading={!s} />
      </div>
      {list.error && <ErrorBanner error={list.error} onRetry={() => list.refetch()} />}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-line-3 px-[18px] py-3.5">
          <SearchInput
            value={q}
            onChange={(v) => {
              setQ(v);
              setPage(1);
            }}
            placeholder="Nom, CNI ou téléphone…"
            className="max-w-[360px]"
          />
        </div>
        <div className="scroll-x">
          <div className={`min-w-[1020px] ${list.isPlaceholderData ? 'opacity-60' : ''}`}>
            <div className="th grid gap-3" style={{ gridTemplateColumns: COLS }}>
              <span>Usager</span>
              <span>CNI</span>
              <span>Quartier</span>
              <span>Véhicules</span>
              <span>Amendes</span>
              <span>Montant dû</span>
              <span>Compte app</span>
              <span />
            </div>
            {list.isLoading && <SkeletonRows rows={PER_PAGE} cols={COLS} />}
            {list.data?.data.map((u) => (
              <div
                key={u.id}
                onClick={() => openDrawer({ type: 'owner', id: u.id })}
                className="tr grid cursor-pointer items-center gap-3 py-3 hover:bg-hover"
                style={{ gridTemplateColumns: COLS }}
              >
                <div className="flex min-w-0 items-center gap-[11px]">
                  <div className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-line-3 text-[13px] font-extrabold text-ink-2">{initials(u.nomComplet)}</div>
                  <div className="min-w-0">
                    <div className="truncate font-extrabold">{u.nomComplet}</div>
                    <div className="font-mono text-[11.5px] font-semibold text-faint">{u.telephone}</div>
                  </div>
                </div>
                <span className="font-mono text-[12.5px] font-bold">{u.cni}</span>
                <span className="truncate font-semibold text-ink-2">{u.quartier ?? '—'}</span>
                <span className="font-mono font-extrabold">{u.vehicules}</span>
                <span className="font-mono font-extrabold">{u.amendes}</span>
                <span className="font-mono font-extrabold" style={{ color: u.du ? '#C93642' : '#9CB0A4' }}>
                  {u.du ? `${fmt(u.du)} F` : '—'}
                </span>
                <Pill color={u.compteApp ? '#0E8C57' : '#6E8378'} bg={u.compteApp ? '#E7F7EF' : '#EEF2EF'}>
                  {u.compteApp ? <DeviceMobile weight="fill" /> : <DeviceMobileSlash />}
                  {u.compteApp ? 'Active' : 'Sans compte'}
                </Pill>
                <CaretRight weight="bold" color="#bcccc1" />
              </div>
            ))}
            {list.data && !list.data.data.length && <Empty>Aucun usager ne correspond</Empty>}
          </div>
        </div>
        <Pagination page={page} pages={Math.ceil((list.data?.total ?? 0) / PER_PAGE)} total={list.data?.total ?? 0} onChange={setPage} />
      </div>
    </>
  );
}
