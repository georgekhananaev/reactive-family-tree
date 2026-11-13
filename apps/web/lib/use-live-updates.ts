'use client';

import { useEffect, useRef } from 'react';

import { api } from './api';

const SETTLE_MS = 120;
const CHECK_EVERY_MS = 30000;

/*
 * Live updates. The server says only "something changed" or "your inbox
 * changed", and this browser then asks for what it may see. Where a stream
 * cannot be held open, a look at the sequence number now and then does the same.
 */
export function useLiveUpdates(userId: string | null, seq: number, refresh: () => Promise<void>): void {
  const latest = useRef({ seq, refresh });
  latest.current = { seq, refresh };

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void latest.current.refresh().catch(() => {}), SETTLE_MS);
    };
    const stream = new EventSource('/api/stream');
    stream.addEventListener('changed', soon);
    stream.addEventListener('inbox', soon);

    const check = setInterval(() => {
      if (document.hidden) return;
      api.get<{ seq: number }>('/api/seq').then((now) => { if (now.seq !== latest.current.seq) soon(); }).catch(() => {});
    }, CHECK_EVERY_MS);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(check);
      stream.close();
    };
    // A new stream when someone signs in or out: the server sends each person their own news
  }, [userId]);
}
