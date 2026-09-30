'use client';

import { CheckSquare, PoliceCar, Square, UsersThree } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/overlays';
import { ErrorBanner, PageHeader, ProgressBar, SearchInput } from '@/components/ui/primitives';
import { api, post, qs } from '@/lib/api';
import { fmt, rateColor } from '@/lib/format';
import { useDebounced, useZones } from '@/lib/hooks';
import { can } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { OfficerRow, Zone } from '@/lib/types';

const SenegalMap3D = dynamic(() => import('@/components/map/SenegalMap3D').then((m) => m.SenegalMap3D), {
  ssr: false,
  loading: () => <div className="skeleton h-full" />,
});

export default function ZonesPage() {
  const { me } = useSession();
  const zones = useZones();
  const [assign, setAssign] = useState<Zone | null>(null);
  const dakar = zones.data?.filter((z) => z.isDakar) ?? [];
  const regional = (zones.data?.length ?? 0) - dakar.length;

  return (
    <>
      <PageHeader title="Zones & commissariats" subtitle={zones.data ? `Réseau national · ${regional} commissariats régionaux · ${dakar.length} zones à Dakar` : ' '} />
      {zones.error && <ErrorBanner error={zones.error} onRetry={() => zones.refetch()} />}
      <div className="card h-auto overflow-hidden md:h-[620px]">{zones.data ? <SenegalMap3D zones={zones.data} /> : <div className="skeleton h-[620px]" />}</div>
      <div className="mt-1 text-[15px] font-extrabold">Zones de la région de Dakar</div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-4">
        {dakar.map((z) => (
          <div key={z.id} className="card flex flex-col gap-3.5 p-[18px] transition-shadow hover:shadow-float">
            <div className="flex items-center gap-3">
              <div className="grad-hero flex h-[42px] w-[42px] items-center justify-center rounded-xl">
                <PoliceCar weight="fill" size={22} color="#fff" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-extrabold">{z.nom}</div>
                <div className="text-[12px] font-semibold text-faint">{z.commissariat}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                [fmt(z.officiers), 'Officiers', ''],
                [fmt(z.amendesMois), 'Amendes', ''],
                [`${(z.encaisseMois / 1e6).toFixed(1).replace('.', ',')}M`, 'Encaissé', '#0E8C57'],
              ].map(([v, l, c]) => (
                <div key={l} className="rounded-[11px] bg-head p-2.5">
                  <div className="font-mono text-[16px] font-extrabold" style={{ color: c || undefined }}>
                    {v}
                  </div>
                  <div className="text-[10.5px] font-bold text-faint">{l}</div>
                </div>
              ))}
            </div>
            <div>
              <div className="flex justify-between text-[12px] font-bold text-muted">
                <span>Recouvrement</span>
                <span className="font-mono font-extrabold" style={{ color: rateColor(z.tauxRecouvrement) }}>
                  {z.tauxRecouvrement}%
                </span>
              </div>
              <div className="mt-1.5">
                <ProgressBar pct={z.tauxRecouvrement} color={rateColor(z.tauxRecouvrement)} height={7} />
              </div>
            </div>
            {can(me?.role, 'manageOfficers') && (!me?.zone || me.zone.id === z.id) && (
              <button
                onClick={() => setAssign(z)}
                className="flex h-10 cursor-pointer items-center justify-center gap-[7px] rounded-[11px] border-[1.5px] border-line-2 text-[13px] font-extrabold text-brand-600 hover:bg-[#F3FAF6]"
              >
                <UsersThree weight="bold" /> Assigner des officiers
              </button>
            )}
          </div>
        ))}
      </div>
      <AssignModal zone={assign} onClose={() => setAssign(null)} />
    </>
  );
}

function AssignModal({ zone, onClose }: { zone: Zone | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const search = useDebounced(q.trim());
  const officers = useQuery({
    queryKey: ['officers', 'assign', search],
    queryFn: () => api<{ data: OfficerRow[] }>(`/officers${qs({ q: search, statut: 'actif' })}`),
    enabled: !!zone,
  });
  const candidates = officers.data?.data.filter((o) => o.zoneId !== zone?.id).slice(0, 30) ?? [];
  const close = () => {
    setPicked(new Set());
    setQ('');
    setError(null);
    onClose();
  };
  const submit = async () => {
    if (!picked.size) return setError('Sélectionnez au moins un officier.');
    setBusy(true);
    try {
      await post(`/zones/${zone!.id}/assign`, { officerIds: [...picked] });
      toast.success(`${picked.size} officier(s) affecté(s) à la zone ${zone!.nom}`);
      ['zones', 'officers'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={!!zone} onClose={close} icon={UsersThree} title={`Assigner à ${zone?.nom ?? ''}`} subtitle="Réaffectation immédiate · visible sur les terminaux" cta={`Affecter (${picked.size})`} onSubmit={submit} error={error} submitting={busy}>
      <div className="col-span-full flex flex-col gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Nom ou matricule…" className="max-w-none" />
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-line-3">
          {candidates.map((o) => {
            const on = picked.has(o.id);
            return (
              <button
                type="button"
                key={o.id}
                onClick={() => setPicked((s) => { const n = new Set(s); if (on) n.delete(o.id); else n.add(o.id); return n; })}
                className="flex w-full cursor-pointer items-center gap-3 border-b border-line-3 px-3 py-2.5 text-left last:border-0 hover:bg-hover"
              >
                {on ? <CheckSquare weight="fill" size={20} color="#16A86E" /> : <Square size={20} color="#9CB0A4" />}
                <span className="flex-1 text-[13px] font-extrabold tracking-normal text-ink">{o.nomComplet}</span>
                <span className="font-mono text-[11.5px] font-bold text-muted">{o.matricule}</span>
                <span className="text-[11.5px] font-semibold text-faint">{o.zone}</span>
              </button>
            );
          })}
          {officers.data && !candidates.length && <div className="p-4 text-center text-[12.5px] font-bold text-faint">Aucun officier disponible</div>}
        </div>
      </div>
    </Modal>
  );
}
