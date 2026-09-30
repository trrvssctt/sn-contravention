'use client';

import { createContext, useContext, useState } from 'react';

export type DrawerState = { type: 'contravention' | 'officer' | 'owner' | 'vehicle'; id: string } | null;
export type ModalState =
  | { type: 'contravention'; plaque?: string }
  | { type: 'officer' }
  | { type: 'vehicle' }
  | { type: 'infraction' }
  | { type: 'admin' }
  | { type: 'suspend'; officer: { id: string; nomComplet: string } }
  | null;

interface Ctx {
  drawer: DrawerState;
  modal: ModalState;
  openDrawer: (d: NonNullable<DrawerState>) => void;
  closeDrawer: () => void;
  openModal: (m: NonNullable<ModalState>) => void;
  closeModal: () => void;
}

const OverlayCtx = createContext<Ctx>(null as unknown as Ctx);

/** État global des tiroirs et modales : une ligne du tableau de bord ouvre la même fiche que le registre. */
export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [modal, setModal] = useState<ModalState>(null);
  return (
    <OverlayCtx.Provider
      value={{
        drawer,
        modal,
        openDrawer: setDrawer,
        closeDrawer: () => setDrawer(null),
        openModal: (m) => {
          setDrawer(null);
          setModal(m);
        },
        closeModal: () => setModal(null),
      }}
    >
      {children}
    </OverlayCtx.Provider>
  );
}

export const useOverlay = () => useContext(OverlayCtx);
