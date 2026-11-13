'use client';

import type { CSSProperties } from 'react';

import { Icon } from './Icon';

/* The year slider: drag it, or press play, to watch the family grow. The melody in the background is turned on and off here too. `music` is null when the family has none. */
export function TimeBar({ year, min, max, playing, music, onYear, onPlay, onMusic }: {
  year: number;
  min: number;
  max: number;
  playing: boolean;
  music: boolean | null;
  onYear(year: number): void;
  onPlay(): void;
  onMusic(): void;
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
      <button id="music" type="button" className="round" aria-label="Background melody" aria-pressed={music === true} title={music ? 'Background melody off (S)' : 'Background melody on (S)'} hidden={music === null} onClick={onMusic}>
        <Icon name={music ? 'music' : 'musicOff'} />
      </button>
    </footer>
  );
}
