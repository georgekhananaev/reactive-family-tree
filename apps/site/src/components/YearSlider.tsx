/*
 * The year slider: drag it, or press Play, to watch the family grow.
 * Author: George Khananaev
 */

import { useId } from 'react';
import type { CSSProperties, ReactElement } from 'react';

export interface YearSliderProps {
  year: number;
  min: number;
  max: number;
  playing: boolean;
  onYear(year: number): void;
  onPlay(): void;
}

export function YearSlider({ year, min, max, playing, onYear, onPlay }: YearSliderProps): ReactElement {
  const id = useId();
  // How much of the track lies behind the thumb, for the browsers that cannot colour it themselves
  const filled = `${((year - min) / Math.max(1, max - min)) * 100}%`;
  return (
    <div className="timebar" role="group" aria-label="The year shown">
      <button type="button" aria-label={playing ? 'Pause' : 'Play the family growing'} onClick={onPlay}>{playing ? 'Pause' : 'Play'}</button>
      <output htmlFor={id}>{year}</output>
      <input id={id} type="range" aria-label="Year" min={min} max={max} value={year} style={{ '--filled': filled } as CSSProperties} onChange={(event) => onYear(Number(event.target.value))} />
      <button type="button" hidden={year >= max} onClick={() => onYear(max)}>Today</button>
    </div>
  );
}
