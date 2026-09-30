'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { Check, Icon, WarningCircle, X } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from './primitives';

/** Panneau latéral droit (fiche contravention, officier, usager, véhicule). */
export function Drawer({
  open,
  onClose,
  kicker,
  title,
  children,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  kicker: string;
  title: React.ReactNode;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-[100] bg-[rgba(12,30,20,.35)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild aria-describedby={undefined}>
              <motion.div
                className="fixed top-0 right-0 bottom-0 z-[101] flex w-[min(500px,100%)] flex-col bg-white shadow-drawer outline-none"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ duration: 0.28, ease: [0.2, 0.8, 0.25, 1] }}
              >
                <div className="flex items-center gap-3 border-b border-line-3 px-[22px] py-5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11.5px] font-extrabold tracking-[.5px] text-faint">{kicker}</div>
                    <Dialog.Title className="mt-0.5 truncate text-[19px] font-extrabold">{title}</Dialog.Title>
                  </div>
                  <Dialog.Close className="flex h-[38px] w-[38px] cursor-pointer items-center justify-center rounded-[11px] bg-neutral hover:bg-line-3" aria-label="Fermer">
                    <X weight="bold" size={17} />
                  </Dialog.Close>
                </div>
                <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-[22px] py-5">{children}</div>
                {actions && <div className="flex flex-wrap gap-2.5 border-t border-line-3 px-[22px] py-4">{actions}</div>}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Modale centrée avec validation inline (création d'officier, d'infraction…). */
export function Modal({
  open,
  onClose,
  icon: I,
  title,
  subtitle,
  children,
  error,
  cta,
  onSubmit,
  submitting,
}: {
  open: boolean;
  onClose: () => void;
  icon: Icon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  error?: string | null;
  cta: string;
  onSubmit: () => void;
  submitting?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div className="fixed inset-0 z-[120] bg-[rgba(12,30,20,.4)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[121] flex items-center justify-center p-5">
              <Dialog.Content asChild aria-describedby={undefined}>
                <motion.form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onSubmit();
                  }}
                  className="pointer-events-auto max-h-[calc(100vh-40px)] w-[min(580px,100%)] overflow-y-auto rounded-[22px] bg-white shadow-modal outline-none"
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  <div className="flex items-start gap-3.5 px-6 pt-[22px] pb-1.5">
                    <div className="flex h-[46px] w-[46px] flex-none items-center justify-center rounded-[14px] bg-mint">
                      <I weight="fill" size={23} color="#16A86E" />
                    </div>
                    <div className="flex-1">
                      <Dialog.Title className="text-[19px] font-extrabold">{title}</Dialog.Title>
                      <div className="mt-0.5 text-[13px] font-semibold text-muted">{subtitle}</div>
                    </div>
                    <Dialog.Close type="button" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-[10px] bg-neutral hover:bg-line-3" aria-label="Fermer">
                      <X weight="bold" />
                    </Dialog.Close>
                  </div>
                  <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3.5 px-6 py-[18px]">{children}</div>
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mx-6 mb-1.5 flex items-center gap-2 rounded-xl bg-danger-bg px-3.5 py-[11px] text-[12.5px] font-bold text-danger-ink"
                      >
                        <WarningCircle weight="fill" /> {error}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <div className="flex justify-end gap-2.5 px-6 pt-3.5 pb-[22px]">
                    <Button type="button" onClick={onClose}>
                      Annuler
                    </Button>
                    <Button type="submit" kind="primary" icon={Check} loading={submitting}>
                      {cta}
                    </Button>
                  </div>
                </motion.form>
              </Dialog.Content>
            </div>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Grille « clé / valeur » des fiches. */
export function InfoGrid({ items }: { items: { k: string; v: React.ReactNode }[] }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
      {items.map((f) => (
        <div key={f.k} className="min-w-0">
          <div className="text-[11px] font-extrabold tracking-[.4px] text-faint-2">{f.k}</div>
          <div className="mt-[3px] text-[13.5px] font-bold break-words">{f.v}</div>
        </div>
      ))}
    </div>
  );
}
