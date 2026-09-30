'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { CarProfile, MagnifyingGlass, Receipt, User } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
import { api, qs } from '@/lib/api';
import { fmt } from '@/lib/format';
import { useOverlay } from '@/lib/overlay-store';
import { PAGES_BY_ROLE } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { Contravention, OwnerRow, Page, VehicleRow } from '@/lib/types';
import { StatusPill } from '../ui/primitives';

function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

/** Recherche globale ⌘K : plaque, N° d'amende, CNI, nom. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const term = useDebounced(q.trim());
  const { openDrawer } = useOverlay();
  const { me } = useSession();
  const pages = me ? PAGES_BY_ROLE[me.role] : [];
  const enabled = open && term.length >= 2;

  const c = useQuery({
    queryKey: ['search', 'c', term],
    queryFn: () => api<Page<Contravention>>(`/contraventions${qs({ q: term, per_page: 5 })}`),
    enabled,
  });
  const v = useQuery({
    queryKey: ['search', 'v', term],
    queryFn: () => api<Page<VehicleRow>>(`/vehicles${qs({ q: term, per_page: 4 })}`),
    enabled: enabled && pages.includes('vehicules'),
  });
  const o = useQuery({
    queryKey: ['search', 'o', term],
    queryFn: () => api<Page<OwnerRow>>(`/owners${qs({ q: term, per_page: 4 })}`),
    enabled: enabled && pages.includes('usagers'),
  });

  const go = (type: 'contravention' | 'vehicle' | 'owner', id: string) => {
    onClose();
    setQ('');
    openDrawer({ type, id });
  };

  const empty = enabled && !c.isFetching && !v.isFetching && !o.isFetching && !c.data?.data.length && !v.data?.data.length && !o.data?.data.length;

  return (
    <Dialog.Root open={open} onOpenChange={(x) => !x && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-[130] bg-[rgba(12,30,20,.35)] backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                className="fixed top-[12vh] left-1/2 z-[131] w-[min(620px,calc(100%-32px))] -translate-x-1/2 overflow-hidden rounded-[20px] bg-white shadow-modal outline-none"
                initial={{ opacity: 0, y: -10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <Dialog.Title className="sr-only">Recherche globale</Dialog.Title>
                <div className="flex items-center gap-3 border-b border-line-3 px-5 py-4">
                  <MagnifyingGlass size={20} color="#16A86E" />
                  <input
                    autoFocus
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Plaque, N° d'amende, CNI, nom…"
                    className="flex-1 bg-transparent text-[16px] font-semibold outline-none placeholder:text-faint-2"
                  />
                  {(c.isFetching || v.isFetching || o.isFetching) && <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand border-t-transparent" />}
                </div>
                <div className="max-h-[420px] overflow-y-auto p-2">
                  {!enabled && <div className="p-6 text-center text-[13px] font-bold text-faint">Tapez au moins 2 caractères</div>}
                  {empty && <div className="p-6 text-center text-[13px] font-bold text-faint">Aucun résultat pour « {term} »</div>}
                  <Group title="CONTRAVENTIONS" show={!!c.data?.data.length}>
                    {c.data?.data.map((x) => (
                      <Item key={x.id} icon={<Receipt weight="fill" color="#16A86E" />} onClick={() => go('contravention', x.id)}>
                        <span className="w-[130px] font-mono text-[12.5px] font-bold text-brand-600">{x.numero}</span>
                        <span className="w-[100px] font-mono text-[12.5px] font-extrabold">{x.plaque}</span>
                        <span className="flex-1 truncate text-[13px] font-semibold text-ink-2">{x.infraction}</span>
                        <StatusPill statut={x.statut} size="sm" />
                      </Item>
                    ))}
                  </Group>
                  <Group title="VÉHICULES" show={!!v.data?.data.length}>
                    {v.data?.data.map((x) => (
                      <Item key={x.id} icon={<CarProfile weight="fill" color="#16A86E" />} onClick={() => go('vehicle', x.plaque)}>
                        <span className="w-[110px] font-mono text-[13px] font-extrabold">{x.plaque}</span>
                        <span className="flex-1 truncate text-[13px] font-bold">
                          {x.marque} {x.modele}
                        </span>
                        <span className="text-[12px] font-semibold text-muted">{x.proprietaire}</span>
                      </Item>
                    ))}
                  </Group>
                  <Group title="USAGERS" show={!!o.data?.data.length}>
                    {o.data?.data.map((x) => (
                      <Item key={x.id} icon={<User weight="fill" color="#16A86E" />} onClick={() => go('owner', x.id)}>
                        <span className="flex-1 truncate text-[13px] font-extrabold">{x.nomComplet}</span>
                        <span className="font-mono text-[12px] font-bold text-muted">{x.cni}</span>
                        {x.du > 0 && <span className="font-mono text-[12px] font-extrabold text-danger-ink">{fmt(x.du)} F</span>}
                      </Item>
                    ))}
                  </Group>
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function Group({ title, show, children }: { title: string; show: boolean; children: React.ReactNode }) {
  if (!show) return null;
  return (
    <div className="mb-1">
      <div className="px-3 pt-2 pb-1 text-[10.5px] font-extrabold tracking-[.8px] text-faint-2">{title}</div>
      {children}
    </div>
  );
}

function Item({ icon, children, onClick }: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-hover focus:bg-mint focus:outline-none">
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-mint">{icon}</span>
      {children}
    </button>
  );
}
