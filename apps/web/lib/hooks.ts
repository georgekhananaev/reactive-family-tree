'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/*
 * Lets something animate in after it appears and animate out before it goes.
 * `present` says whether it should be on the page at all, and `shown` whether
 * it should have its open look. The stylesheet does the rest with a transition.
 */
export function usePresence(open: boolean, leaveMs: number): { present: boolean; shown: boolean } {
  const [was, setWas] = useState(open);
  const [leaving, setLeaving] = useState(false);
  const [shown, setShown] = useState(false);
  if (open !== was) {
    setWas(open);
    setLeaving(!open);
  }
  useLayoutEffect(() => {
    if (!open) {
      setShown(false);
      return;
    }
    // It is on the page now but still looks closed. The browser has to see that before it is opened.
    void document.body.offsetWidth;
    setShown(true);
  }, [open]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(false), leaveMs);
    return () => clearTimeout(timer);
  }, [leaving, leaveMs]);
  return { present: open || leaving, shown };
}

/*
 * Something a button starts, which is not started again while it still runs. A second press, or Enter and then a click,
 * would otherwise send the same thing twice: two requests to join, two invitations, the same comment again.
 */
export function useSingle<Args extends unknown[]>(work: (...args: Args) => Promise<unknown>): (...args: Args) => Promise<void> {
  const latest = useRef(work);
  latest.current = work;
  const running = useRef(false);
  return useCallback(async (...args: Args) => {
    if (running.current) return;
    running.current = true;
    try {
      await latest.current(...args);
    } finally {
      running.current = false;
    }
  }, []);
}
