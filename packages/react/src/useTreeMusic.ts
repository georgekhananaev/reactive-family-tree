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
 *
 * An iPhone lets a page start its sound only inside the tap that asks for it,
 * so the button that asks calls `wake()` from its own click, before anything
 * else happens. The music itself follows a moment later, on the sound woken
 * there.
 * Author: George Khananaev
 */

import type { MusicMode } from '@reactive-family-tree/core';
import { useCallback, useEffect, useRef, useState } from 'react';

import { TreeMusic } from './music';
import { PageSound } from './sound';

/* Where each visitor's own choice is kept, on their device. */
const KEPT = 'rft-music';

export interface TreeMusicOptions {
  /* The melody in the background, as the tree's owner chose: none at all, one that waits to be turned on, or one that plays from a visitor's first click. */
  mode?: MusicMode;
  /* Whether pressing Play brings its quick tune. Yes, unless the tree's owner said no. */
  playMusic?: boolean;
  /* Which melody plays in the background, by its id in MELODIES. The first, when it is left out or not known. */
  melody?: string;
  /* Which quick tune plays with the years, by its id in QUICK_TUNES. The background melody's own, when it is left out. */
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
  /* Call it from the click that turns the melody on or off. It wakes the sound itself when it is turned on. */
  toggle(): void;
  /*
   * Call it inside the click or key press that asks for music some other way, such as a Play button's when the quick
   * tune plays with the years, or a button that tries a melody out. An iPhone lets a page start its sound only then.
   */
  wake(): void;
}

/* Play the tree's music. `lively` is true while the years are playing. */
export function useTreeMusic(lively: boolean, { mode = 'off', playMusic = true, melody, playMelody = melody, audition = null }: TreeMusicOptions = {}): TreeMusicSwitch {
  // The visitor's own choice, once they have made one. Until then the owner's choice stands.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const available = mode !== 'none', on = available && (chosen ?? mode === 'on');
  const music = useRef<{ made: string; player: TreeMusic } | null>(null);
  // The page's sound. A browser keeps it asleep until a visitor's click, tap or key wakes it.
  const sound = useRef<PageSound | null>(null);
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
    const ctx = sound.current?.context;
    if (!ctx) return;
    try {
      const now = wanted.current, made = `${now.melody} ${now.playMelody}`;
      // Another melody was chosen: the player that knew the old one goes, and one is made for the new, on the same sound
      if (music.current && music.current.made !== made) {
        music.current.player.close();
        music.current = null;
      }
      if (now.sounding && !document.hidden) {
        sound.current?.hold();
        music.current ??= { made, player: new TreeMusic(now.melody, now.playMelody, ctx) };
        music.current.player.setMood(now.quick ? 'lively' : 'calm');
        music.current.player.play();
      } else if (music.current) {
        // It fades, and goes back to the calm tune's place, so that the quick one starts from its own beginning the next time the years play
        music.current.player.pause();
        music.current.player.setMood('calm');
        sound.current?.rest();
      }
    } catch {
      // A browser that cannot make sound this way stays silent, and the tree works as before
    }
  }, []);

  /* The visitor asked for music. Called inside their click, tap or key press. */
  const wake = useCallback(() => {
    try {
      sound.current?.wake(true);
    } catch {
      // No sound in this browser
    }
  }, []);

  useEffect(() => {
    try {
      const kept = localStorage.getItem(KEPT);
      if (kept === '0' || kept === '1') setChosen(kept === '1');
    } catch { /* private browsing */ }
    const page = new PageSound();
    sound.current = page;
    // Music wanted without being asked for just now (the melody that plays from a first click, or music that went quiet
    // while the page was out of sight) starts on the visitor's next click, tap or key, which are the moments a browser
    // counts as their own doing. It does not play through the silent switch: nobody pressed a button for it.
    const allow = () => {
      try {
        if (wanted.current.sounding) page.wake(false);
      } catch {
        // No sound in this browser
      }
      tune();
    };
    const moments = ['pointerup', 'click', 'keydown'] as const;
    for (const moment of moments) window.addEventListener(moment, allow, true);
    document.addEventListener('visibilitychange', tune);
    return () => {
      for (const moment of moments) window.removeEventListener(moment, allow, true);
      document.removeEventListener('visibilitychange', tune);
      music.current?.player.close();
      music.current = null;
      page.close();
      sound.current = null;
    };
  }, [tune]);

  useEffect(tune, [tune, on, quick, melody, playMelody, audition]);

  const toggle = useCallback(() => {
    const next = !isOn.current;
    if (next) wake();
    try { localStorage.setItem(KEPT, next ? '1' : '0'); } catch { /* private browsing */ }
    setChosen(next);
  }, [wake]);

  return { available, on, toggle, wake };
}
