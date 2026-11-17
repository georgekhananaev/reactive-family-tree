'use client';

import { useEffect, useRef } from 'react';

import { api } from './api';

const SETTLE_MS = 120;
const CHECK_EVERY_MS = 30000;
const LISTEN_AGAIN_MS = 5000;

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
    let stream: EventSource | null = null, again: ReturnType<typeof setTimeout> | null = null, heard = false;
    const listen = () => {
      const opened = new EventSource('/api/stream');
      stream = opened;
      opened.addEventListener('changed', soon);
      opened.addEventListener('inbox', soon);
      // Listening again after a gap: what happened meanwhile was not heard, so the page asks
      opened.addEventListener('open', () => {
        if (heard) soon();
        heard = true;
      });
      // A connection that only dropped is taken up again by the browser itself. One that was turned away, as by a proxy while
      // the server restarts, is given up for good, and then a new one is opened here after a little while.
      opened.addEventListener('error', () => {
        if (opened.readyState !== EventSource.CLOSED || stream !== opened) return;
        heard = true;
        again = setTimeout(listen, LISTEN_AGAIN_MS);
      });
    };
    listen();

    const check = setInterval(() => {
      if (document.hidden) return;
      api.get<{ seq: number }>('/api/seq').then((now) => { if (now.seq !== latest.current.seq) soon(); }).catch(() => {});
    }, CHECK_EVERY_MS);

    return () => {
      if (timer) clearTimeout(timer);
      if (again) clearTimeout(again);
      clearInterval(check);
      const open = stream;
      // No stream is this one's own any more, so nothing it still says opens another
      stream = null;
      open?.close();
    };
    // A new stream when someone signs in or out: the server sends each person their own news
  }, [userId]);
}
