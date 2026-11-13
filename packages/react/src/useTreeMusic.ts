'use client';

/*
 * The music, for a page that shows the tree. There are two things here, and
 * whoever runs the tree decides each apart from the other.
 *
 * One is the melody in the background: whether there is any, and whether it
 * starts on or off. Each visitor can then turn it on or off for themselves.
 * The other is the quick tune that goes with the years playing. It belongs to
 * the Play button, and sounds whether or not the background melody is on.
 *
 * All of it is quiet while the page is out of sight.
 * Author: George Khananaev
 */

import type { MusicMode } from '@reactive-family-tree/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TreeMusic } from './music';

/* Where each visitor's own choice is kept, on their device. */
const KEPT = 'rft-music';

export interface TreeMusicOptions {
  /* The melody in the background, as the tree's owner chose: none at all, one that waits to be turned on, or one that plays from a visitor's first click. */
  mode?: MusicMode;
  /* Whether pressing Play brings its quick tune. Yes, unless the tree's owner said no. */
  playMusic?: boolean;
  /* Which melody plays in the background, by its id in MELODIES. The first, when it is left out or not known. */
  melody?: string;
  /* Which melody the quick tune is made from. The background one, when it is left out. */
  playMelody?: string;
  /* A melody someone is trying out. While it is given it plays, whatever else is chosen. */
  audition?: MelodyTrial | null;
}

/* A melody being tried out: which one, and whether as the quick tune or as the calm one. */
export interface MelodyTrial {
  melody: string;
  quick: boolean;
}

/* The visitor's own switch, for the melody in the background. */
export interface TreeMusicSwitch {
  /* False when the tree's owner has turned the background melody off for everyone. There is then nothing to switch. */
  available: boolean;
  /* Whether this visitor has the background melody on. It may still be waiting for their first click. */
  on: boolean;
  toggle(): void;
}

/* Play the tree's music. `lively` is true while the years are playing. */
export function useTreeMusic(lively: boolean, { mode = 'off', playMusic = true, melody, playMelody = melody, audition = null }: TreeMusicOptions = {}): TreeMusicSwitch {
  // The visitor's own choice, once they have made one. Until then the owner's choice stands.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const available = mode !== 'none', on = available && (chosen ?? mode === 'on');
  const music = useRef<{ made: string; player: TreeMusic } | null>(null);
  // A browser keeps a page silent until its visitor has clicked, tapped or pressed a key
  const allowed = useRef(false);
  // The quick tune plays with the years where the owner allows it. Someone trying a melody out hears just what they asked for.
  const quick = audition ? audition.quick : lively && playMusic;
  const wanted = useRef({ sounding: on, quick, melody, playMelody });
  wanted.current = {
    sounding: on || quick || Boolean(audition),
    quick,
    melody: audition && !audition.quick ? audition.melody : melody,
    playMelody: audition?.quick ? audition.melody : playMelody,
  };
  const isOn = useRef(on);
  isOn.current = on;

  /* Bring the music in line with what is wanted now. Safe to call as often as anything changes. */
  const tune = useCallback(() => {
    if (!allowed.current) return;
    try {
      const now = wanted.current, made = `${now.melody} ${now.playMelody}`;
      // Another melody was chosen: the player that knew the old one goes, and one is made for the new
      if (music.current && music.current.made !== made) {
        music.current.player.close();
        music.current = null;
      }
      if (now.sounding && !document.hidden) {
        music.current ??= { made, player: new TreeMusic(now.melody, now.playMelody) };
        music.current.player.setMood(now.quick ? 'lively' : 'calm');
        music.current.player.play();
      } else if (music.current) {
        // It fades, and goes back to the calm tune's place, so that the quick one starts from its own beginning the next time the years play
        music.current.player.pause();
        music.current.player.setMood('calm');
      }
    } catch {
      // A browser that cannot make sound this way stays silent, and the tree works as before
    }
  }, []);

  useEffect(() => {
    try {
      const kept = localStorage.getItem(KEPT);
      if (kept === '0' || kept === '1') setChosen(kept === '1');
    } catch { /* private browsing */ }
    const allow = () => {
      allowed.current = true;
      tune();
    };
    // The end of a click or tap, and a key going down, are the moments a browser counts as the visitor's own doing
    window.addEventListener('pointerup', allow, true);
    window.addEventListener('keydown', allow, true);
    document.addEventListener('visibilitychange', tune);
    return () => {
      window.removeEventListener('pointerup', allow, true);
      window.removeEventListener('keydown', allow, true);
      document.removeEventListener('visibilitychange', tune);
      music.current?.player.close();
      music.current = null;
    };
  }, [tune]);

  useEffect(tune, [tune, on, quick, melody, playMelody, audition]);

  const toggle = useCallback(() => {
    const next = !isOn.current;
    try { localStorage.setItem(KEPT, next ? '1' : '0'); } catch { /* private browsing */ }
    setChosen(next);
  }, []);

  return { available, on, toggle };
}
