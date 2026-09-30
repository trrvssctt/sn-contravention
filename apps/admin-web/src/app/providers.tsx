'use client';

import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        position="bottom-center"
        duration={2600}
        icons={{ success: <CheckCircle weight="fill" size={19} color="#3CD99A" />, error: <WarningCircle weight="fill" size={19} color="#FF8A94" /> }}
        toastOptions={{
          style: {
            background: '#16271E',
            color: '#fff',
            border: 'none',
            borderRadius: 14,
            fontFamily: 'Manrope, system-ui, sans-serif',
            fontWeight: 700,
            fontSize: 13.5,
            boxShadow: '0 20px 40px -16px rgba(0,0,0,.4)',
          },
          descriptionClassName: '!text-[#A7C7B6] !font-semibold',
        }}
      />
    </QueryClientProvider>
  );
}
