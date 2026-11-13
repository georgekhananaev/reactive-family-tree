'use client';

import type { CSSProperties } from 'react';

import { Icon } from './Icon';

/* The year slider: drag it, or press play, to watch the family grow. */
export function TimeBar({ year, min, max, playing, onYear, onPlay }: {
  year: number;
  min: number;
  max: number;
  playing: boolean;
  onYear(year: number): void;
  onPlay(): void;
}) {
  const filled = `${((year - min) / Math.max(1, max - min)) * 100}%`;
  return (
    <footer className="timebar panel">
      <button id="play" type="button" className="round" aria-label={playing ? 'Pause' : 'Play the family growing'} title="Play (P)" onClick={onPlay}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <output id="yearOut" htmlFor="year">{year}</output>
      <input id="year" type="range" aria-label="Year" min={min} max={max} value={year} style={{ '--filled': filled } as CSSProperties} onChange={(event) => onYear(Number(event.target.value))} />
      <button id="today" type="button" className="small" hidden={year >= max} onClick={() => onYear(max)}>Today</button>
    </footer>
  );
}
