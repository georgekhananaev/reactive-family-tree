'use client';

import type { CSSProperties } from 'react';

import { useT } from '@/lib/i18n';

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
  const { t } = useT();
  const filled = `${((year - min) / Math.max(1, max - min)) * 100}%`;
  return (
    <footer className="timebar panel">
      <button id="play" type="button" className="round" aria-label={playing ? t('Pause') : t('Play the family growing')} title={t('Play (P)')} onClick={onPlay}>
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      <output id="yearOut" htmlFor="year">{year}</output>
      <input id="year" type="range" aria-label={t('Year')} min={min} max={max} value={year} style={{ '--filled': filled } as CSSProperties} onChange={(event) => onYear(Number(event.target.value))} />
      <button id="today" type="button" className="small" hidden={year >= max} onClick={() => onYear(max)}>{t('Today')}</button>
      <button id="music" type="button" className="round" aria-label={t('Background melody')} aria-pressed={music === true} title={music ? t('Background melody off (S)') : t('Background melody on (S)')} hidden={music === null} onClick={onMusic}>
        <Icon name={music ? 'music' : 'musicOff'} />
      </button>
    </footer>
  );
}
