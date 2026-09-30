'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { API_URL, tokens } from './api';
import { fmt } from './format';
import type { Contravention, Payment } from './types';

interface RealtimeCtx {
  connected: boolean;
  officersOnline: number | null;
  /** Numéros des contraventions arrivées en direct (surbrillance dans les tableaux). */
  fresh: Set<string>;
}

const Ctx = createContext<RealtimeCtx>({ connected: false, officersOnline: null, fresh: new Set() });

/**
 * Canal WebSocket : chaque émission / paiement invalide les requêtes concernées,
 * le tableau de bord se met donc à jour sans rechargement (badge « Temps réel »).
 */
export function RealtimeProvider({ children, enabled }: { children: React.ReactNode; enabled: boolean }) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [officersOnline, setOnline] = useState<number | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const socket = io(`${API_URL}/ws`, {
      auth: (cb) => cb({ token: tokens.get()?.accessToken }),
      transports: ['websocket'],
      reconnectionDelayMax: 10_000,
    });
    socketRef.current = socket;

    const invalidate = (...keys: string[]) => keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('presence.updated', (p: { officersOnline: number }) => setOnline(p.officersOnline));
    socket.on('contravention.created', (c: Contravention) => {
      invalidate('contraventions', 'dashboard', 'status', 'counts');
      setFresh((s) => new Set(s).add(c.numero));
      setTimeout(() => setFresh((s) => { const n = new Set(s); n.delete(c.numero); return n; }), 4000);
      toast(`Nouvelle contravention ${c.numero}`, { description: `${c.plaque} · ${c.infraction} · ${fmt(c.montantTotal)} F` });
    });
    socket.on('contravention.updated', () => invalidate('contraventions', 'contravention', 'counts'));
    socket.on('payment.confirmed', (p: Payment) => {
      invalidate('contraventions', 'contravention', 'dashboard', 'finance', 'payments', 'counts', 'owners');
      toast(`Paiement confirmé ${p.numeroRecu}`, { description: `${fmt(p.montant)} F · ${p.encaissePar}` });
    });
    socket.on('infraction_types.updated', () => invalidate('infractions'));
    socket.on('officer.suspended', () => invalidate('officers'));
    socket.on('notification.created', () => invalidate('notifications'));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [enabled, qc]);

  return <Ctx.Provider value={{ connected, officersOnline, fresh }}>{children}</Ctx.Provider>;
}

export const useRealtime = () => useContext(Ctx);
