'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

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
