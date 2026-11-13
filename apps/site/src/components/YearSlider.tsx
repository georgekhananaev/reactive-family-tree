/*
 * The year slider: drag it, or press Play, to watch the family grow. The music
 * that goes with it, calm until the years play, is turned on and off here too.
 * Author: George Khananaev
 */

import { useId } from 'react';
import type { CSSProperties, ReactElement } from 'react';
import { useTreeMusic } from 'reactive-family-tree';

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
  const music = useTreeMusic(playing);
  // How much of the track lies behind the thumb, for the browsers that cannot colour it themselves
  const filled = `${((year - min) / Math.max(1, max - min)) * 100}%`;
  return (
    <div className="timebar" role="group" aria-label="The year shown">
      <button type="button" aria-label={playing ? 'Pause' : 'Play the family growing'} onClick={onPlay}>{playing ? 'Pause' : 'Play'}</button>
      <output htmlFor={id}>{year}</output>
      <input id={id} type="range" aria-label="Year" min={min} max={max} value={year} style={{ '--filled': filled } as CSSProperties} onChange={(event) => onYear(Number(event.target.value))} />
      <button type="button" hidden={year >= max} onClick={() => onYear(max)}>Today</button>
      <button type="button" className="music" aria-label="Music" aria-pressed={music.on} title={music.on ? 'Music off' : 'Music on'} onClick={music.toggle}>♪</button>
    </div>
  );
}
