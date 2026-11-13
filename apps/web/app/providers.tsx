'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api';

/* A refusal is an answer, so it is shown at once. Only a server or network that failed is asked once more. */
const worthAskingAgain = (failures: number, error: unknown) => failures < 1 && !(error instanceof ApiError && error.status < 500);

/* What was fetched is kept and shared between the parts of the page. The live stream says when to fetch again. */
export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, refetchOnWindowFocus: false, retry: worthAskingAgain } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
