'use client';

import { AnimatePresence, motion } from 'motion/react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DrawerHost } from '@/components/drawers/DrawerHost';
import { Sidebar } from '@/components/layout/Sidebar';
import { Topbar } from '@/components/layout/Topbar';
import { ModalHost } from '@/components/modals/ModalHost';
import { OverlayProvider } from '@/lib/overlay-store';
import { PageId, PAGES_BY_ROLE } from '@/lib/rbac';
import { RealtimeProvider } from '@/lib/realtime';
import { SessionProvider, useSession } from '@/lib/session';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { me, loading } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const page = pathname.split('/')[1] as PageId;
  const allowed = me ? PAGES_BY_ROLE[me.role].includes(page) : true;

  // Page non autorisée pour ce rôle (403) → retour au tableau de bord.
  useEffect(() => {
    if (me && !allowed) router.replace('/dashboard');
  }, [me, allowed, router]);

  if (loading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex items-center gap-3 text-[14px] font-bold text-muted">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand border-t-transparent" /> Chargement…
        </div>
      </div>
    );
  }

  return (
    <RealtimeProvider enabled>
      <OverlayProvider>
        <div className="flex min-h-screen">
          <div className="sticky top-0 hidden h-screen lg:block">
            <Sidebar />
          </div>
          <AnimatePresence>
            {menu && (
              <>
                <motion.div className="fixed inset-0 z-[90] bg-[rgba(12,30,20,.35)] lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenu(false)} />
                <motion.div
                  className="fixed top-0 bottom-0 left-0 z-[91] lg:hidden"
                  initial={{ x: '-100%' }}
                  animate={{ x: 0 }}
                  exit={{ x: '-100%' }}
                  transition={{ duration: 0.25, ease: [0.2, 0.8, 0.25, 1] }}
                >
                  <Sidebar onNavigate={() => setMenu(false)} />
                </motion.div>
              </>
            )}
          </AnimatePresence>
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar onMenu={() => setMenu(true)} />
            <main className="flex w-full max-w-[1480px] flex-col gap-5 px-4 pt-[26px] pb-12 lg:px-7">
              {allowed && (
                <motion.div key={pathname} className="flex flex-col gap-[18px]" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
                  {children}
                </motion.div>
              )}
            </main>
          </div>
        </div>
        <DrawerHost />
        <ModalHost />
      </OverlayProvider>
    </RealtimeProvider>
  );
}
