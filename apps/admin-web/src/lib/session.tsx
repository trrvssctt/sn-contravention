'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, API_URL, tokens } from './api';
import type { Me } from './types';

interface SessionCtx {
  me: Me | undefined;
  loading: boolean;
  logout: () => void;
}

const Ctx = createContext<SessionCtx>({ me: undefined, loading: true, logout: () => {} });

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [hasToken, setHasToken] = useState<boolean | null>(null);

  useEffect(() => {
    const t = tokens.get();
    setHasToken(!!t);
    if (!t) router.replace('/login');
  }, [router]);

  const { data: me, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => api<Me>('/auth/me'),
    enabled: !!hasToken,
    staleTime: 5 * 60_000,
  });

  const logout = useCallback(() => {
    tokens.clear();
    qc.clear();
    router.replace('/login');
  }, [qc, router]);

  return <Ctx.Provider value={{ me, loading: hasToken === null || isLoading, logout }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

export async function login(email: string, password: string) {
  const res = await fetch(`${API_URL}/v1/auth/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message ?? 'Connexion impossible');
  tokens.set(body);
}
