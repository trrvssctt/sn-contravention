'use client';

import {
  Bank,
  CarProfile,
  CloudCheck,
  CloudSlash,
  GearSix,
  Icon,
  ListChecks,
  MapTrifold,
  PoliceCar,
  Receipt,
  SquaresFour,
  Users,
} from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import { fmt } from '@/lib/format';
import { PageId, PAGES_BY_ROLE } from '@/lib/rbac';
import { useRealtime } from '@/lib/realtime';
import { useSession } from '@/lib/session';
import { cx } from '../ui/primitives';

const NAV: { title: string; items: { id: PageId; label: string; icon: Icon; badge?: boolean }[] }[] = [
  { title: 'PILOTAGE', items: [{ id: 'dashboard', label: 'Tableau de bord', icon: SquaresFour }] },
  {
    title: 'OPÉRATIONS',
    items: [
      { id: 'contraventions', label: 'Contraventions', icon: Receipt, badge: true },
      { id: 'tresor', label: 'Paiements & Trésor', icon: Bank },
    ],
  },
  {
    title: 'RÉFÉRENTIELS',
    items: [
      { id: 'officiers', label: 'Officiers', icon: PoliceCar },
      { id: 'usagers', label: 'Usagers', icon: Users },
      { id: 'vehicules', label: 'Véhicules', icon: CarProfile },
    ],
  },
  {
    title: 'CONFIGURATION',
    items: [
      { id: 'infractions', label: 'Infractions & montants', icon: ListChecks },
      { id: 'zones', label: 'Zones & commissariats', icon: MapTrifold },
      { id: 'parametres', label: 'Admins & paramètres', icon: GearSix },
    ],
  },
];

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { me } = useSession();
  const { connected, officersOnline } = useRealtime();
  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: () => api<{ contraventionsAujourdhui: number; terminauxConnectes: number }>('/dashboard/status'),
    refetchInterval: 60_000,
    enabled: !!me,
  });
  const allowed = me ? PAGES_BY_ROLE[me.role] : [];
  const online = officersOnline ?? status?.terminauxConnectes ?? 0;

  return (
    <aside className="flex h-full w-[252px] flex-none flex-col overflow-y-auto border-r border-line bg-white">
      <div className="flex items-center gap-3 border-b border-line-3 px-5 pt-[22px] pb-[18px]">
        <div className="flex h-11 w-11 flex-none items-center justify-center rounded-[13px] border border-line-2 bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/flag-senegal.svg" alt="Sénégal" className="h-5 w-[30px] rounded-[3px] object-cover" />
        </div>
        <div className="min-w-0">
          <div className="text-[15.5px] font-extrabold tracking-[-.2px]">SEN Contraventions</div>
          <div className="text-[11.5px] font-bold text-muted">Administration centrale</div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-[18px] px-3 py-3.5">
        {NAV.map((g) => {
          const items = g.items.filter((i) => allowed.includes(i.id));
          if (!items.length) return null;
          return (
            <div key={g.title} className="flex flex-col gap-[3px]">
              <div className="px-3 pb-1.5 text-[10.5px] font-extrabold tracking-[.8px] text-faint-2">{g.title}</div>
              {items.map((n) => {
                const active = pathname.startsWith(`/${n.id}`);
                const I = n.icon;
                return (
                  <Link
                    key={n.id}
                    href={`/${n.id}`}
                    onClick={onNavigate}
                    className={cx(
                      'flex items-center gap-[11px] rounded-xl px-3 py-2.5 text-[14px] transition-colors',
                      active ? 'bg-mint font-extrabold text-brand-600' : 'font-semibold text-ink-2 hover:bg-hover',
                    )}
                  >
                    <I size={19} weight={active ? 'fill' : 'regular'} />
                    <span className="flex-1">{n.label}</span>
                    {n.badge && !!status?.contraventionsAujourdhui && (
                      <span className="rounded-[20px] bg-danger-bg px-[7px] py-0.5 font-mono text-[10.5px] font-extrabold text-danger-ink" title="Émises aujourd'hui">
                        {fmt(status.contraventionsAujourdhui)}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className={cx('mx-3.5 mb-4 flex items-start gap-2.5 rounded-[14px] p-3.5', connected ? 'bg-mint' : 'bg-warn-bg')}>
        {connected ? <CloudCheck weight="fill" size={20} color="#0E8C57" /> : <CloudSlash weight="fill" size={20} color="#B4701A" />}
        <div>
          <div className={cx('text-[12.5px] font-extrabold', connected ? 'text-brand-700' : 'text-warn-ink')}>{connected ? 'Synchronisé' : 'Reconnexion…'}</div>
          <div className={cx('text-[11.5px] font-semibold', connected ? 'text-mint-ink' : 'text-warn-ink')}>
            {online} terminal{online > 1 ? 'aux' : ''} mobile{online > 1 ? 's' : ''} connecté{online > 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </aside>
  );
}
