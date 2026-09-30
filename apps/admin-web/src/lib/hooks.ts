'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { api, download } from './api';
import type { Zone } from './types';

export function useDebounced<T>(v: T, ms = 250) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function useZones() {
  return useQuery({ queryKey: ['zones'], queryFn: () => api<Zone[]>('/zones'), staleTime: 5 * 60_000 });
}

export function useExport() {
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (path: string, name: string) => {
    setBusy(path);
    try {
      const file = await download(path, name);
      toast.success(`Export généré · ${file}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}
