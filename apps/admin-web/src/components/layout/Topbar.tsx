'use client';

import { Bell, CaretUpDown, Checks, List, MagnifyingGlass, SignOut } from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'motion/react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, post } from '@/lib/api';
import { fmtLongDate, fmtRelative, initials } from '@/lib/format';
import { PAGE_TITLES, PageId, ROLE_LABEL } from '@/lib/rbac';
import { useSession } from '@/lib/session';
import type { Notification } from '@/lib/types';
import { CommandPalette } from './CommandPalette';

function useClickOutside(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && close();
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [ref, close]);
}

const popIn = { initial: { opacity: 0, y: -6, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1 }, exit: { opacity: 0, y: -4, scale: 0.98 }, transition: { duration: 0.16 } };

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const pathname = usePathname();
  const { me, logout } = useSession();
  const [search, setSearch] = useState(false);
  const page = (pathname.split('/')[1] || 'dashboard') as PageId;

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearch(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex items-center gap-2.5 sm:gap-4 border-b border-line-2 bg-[rgba(240,245,241,.92)] px-4 py-3.5 backdrop-blur-[10px] lg:px-7">
      <button onClick={onMenu} className="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-xl border border-line-2 bg-white lg:hidden" aria-label="Menu">
        <List size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] font-bold text-faint">Administration / {PAGE_TITLES[page] ?? ''}</div>
        <div className="truncate text-[13px] font-semibold text-muted" suppressHydrationWarning>
          {fmtLongDate()}
        </div>
      </div>
      <button
        onClick={() => setSearch(true)}
        className="hidden h-[42px] min-w-[240px] cursor-pointer items-center gap-2.5 rounded-xl border border-line-2 bg-white px-3.5 hover:border-mint-3 md:flex"
      >
        <MagnifyingGlass size={18} color="#9CB0A4" />
        <span className="text-[13px] font-semibold text-faint-2">Plaque, N° d&apos;amende, CNI…</span>
        <span className="ml-auto rounded-md border border-line-2 px-1.5 py-px font-mono text-[11px] font-bold text-faint-2">⌘K</span>
      </button>
      <button onClick={() => setSearch(true)} className="flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-xl border border-line-2 bg-white md:hidden" aria-label="Rechercher">
        <MagnifyingGlass size={19} />
      </button>
      <NotificationsBell />
      {me && <UserMenu name={me.nom} role={ROLE_LABEL[me.role]} zone={me.zone?.nom} onLogout={logout} />}
      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </header>
  );
}

function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  useClickOutside(ref, () => setOpen(false));
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<{ data: Notification[]; unread: number }>('/notifications?per_page=8'),
    refetchInterval: 120_000,
  });
  const readAll = useMutation({
    mutationFn: () => post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-xl border border-line-2 bg-white hover:bg-hover"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {!!data?.unread && <span className="absolute top-[9px] right-2.5 h-2 w-2 rounded-full bg-danger ring-2 ring-white" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popIn} className="absolute right-0 mt-2 w-[340px] max-w-[calc(100vw-32px)] origin-top-right overflow-hidden rounded-2xl border border-line bg-white shadow-float">
            <div className="flex items-center justify-between border-b border-line-3 px-4 py-3">
              <div className="text-[14px] font-extrabold">Notifications {!!data?.unread && <span className="text-danger-ink">· {data.unread}</span>}</div>
              {!!data?.unread && (
                <button onClick={() => readAll.mutate()} className="flex cursor-pointer items-center gap-1 text-[12px] font-extrabold text-brand-600">
                  <Checks weight="bold" /> Tout lire
                </button>
              )}
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              {data?.data.length ? (
                data.data.map((n) => (
                  <div key={n.id} className="flex gap-3 border-b border-line-3 px-4 py-3 last:border-0">
                    <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${n.lu ? 'bg-transparent' : 'bg-brand'}`} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-extrabold">{n.titre}</div>
                      <div className="text-[12px] font-semibold text-muted">{n.corps}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-faint-2">{fmtRelative(n.createdAt)}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 text-center text-[13px] font-bold text-faint">Aucune notification</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function UserMenu({ name, role, zone, onLogout }: { name: string; role: string; zone?: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex h-[42px] cursor-pointer items-center gap-2.5 rounded-xl border border-line-2 bg-white pr-2 pl-1.5 hover:bg-hover">
        <div className="grad-hero flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[12px] font-extrabold text-white">{initials(name)}</div>
        <div className="hidden text-left leading-[1.15] sm:block">
          <div className="text-[13px] font-extrabold">{name}</div>
          <div className="text-[11px] font-bold text-brand-600">{role}</div>
        </div>
        <CaretUpDown weight="bold" size={14} color="#9CB0A4" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div {...popIn} className="absolute right-0 mt-2 w-[240px] origin-top-right overflow-hidden rounded-2xl border border-line bg-white p-1.5 shadow-float">
            <div className="px-3 py-2.5">
              <div className="text-[13px] font-extrabold">{name}</div>
              <div className="text-[12px] font-semibold text-muted">
                {role}
                {zone ? ` · Zone ${zone}` : ' · National'}
              </div>
            </div>
            <button onClick={onLogout} className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-extrabold text-danger-ink hover:bg-danger-bg">
              <SignOut weight="bold" /> Se déconnecter
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
