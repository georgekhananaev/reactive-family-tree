/*
 * The year the tree is shown at, and the replay that walks it from the first
 * birth to today. The steps are the app's own: one year every 110ms.
 * Author: George Khananaev
 */

import { useEffect, useState } from 'react';

import type { YearSpan } from '../lib/demo-family';

const STEP_MS = 110;

export interface Timeline {
  year: number;
  playing: boolean;
  /* Go to a year by hand. This stops the replay. */
  choose(year: number): void;
  /* Start the replay, from the first year when the tree is at today, or stop it. */
  toggle(): void;
}

export function useTimeline({ min, max }: YearSpan): Timeline {
  const [year, setYear] = useState(max);
  const [asked, setAsked] = useState(false);
  // The replay ends by itself when it reaches today
  const playing = asked && year < max;

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => setYear((at) => Math.min(max, at + 1)), STEP_MS);
    return () => clearInterval(timer);
  }, [playing, max]);

  return {
    year,
    playing,
    choose(value) {
      setAsked(false);
      setYear(Math.max(min, Math.min(max, value)));
    },
    toggle() {
      if (playing) return setAsked(false);
      if (year >= max) setYear(min);
      setAsked(true);
    },
  };
}
