/*
 * The melodies are written out by hand, so a slip of the pen is the likely way
 * for one to go wrong: a note from outside its scale, or a line a step short.
 */

import { expect, test } from 'vitest';

import { MELODIES, QUICK_TUNES, readQuick, readScore } from '../src/music';
import type { ScoreLine, Sound } from '../src/music';

const NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
/* The name of the note a pitch is, whatever its octave. */
const nameOf = (hertz: number): string => NAMES[((Math.round(12 * Math.log2(hertz / 440)) % 12) + 12) % 12] ?? '?';
const VOICES = ['koto', 'deep', 'flute', 'drop'] as const;
const soundsOf = (lines: ScoreLine[]): Sound[] => lines.flatMap((line) => VOICES.flatMap((voice) => line[voice].filter((sound) => sound !== null)));

test('there are melodies and quick tunes to choose from, each known by a name a setting can hold', () => {
  expect(MELODIES.length).toBeGreaterThanOrEqual(5);
  expect(QUICK_TUNES.length).toBeGreaterThanOrEqual(10);
  for (const list of [MELODIES, QUICK_TUNES]) {
    expect(new Set(list.map((one) => one.id)).size, 'no two share an id').toBe(list.length);
    for (const one of list) {
      // The same shape the server asks of the setting
      expect(one.id).toMatch(/^[a-z][a-z-]{0,39}$/);
      expect([one.name.length > 0, one.about.endsWith('.')]).toEqual([true, true]);
    }
  }
  expect(readScore('no-such-melody'), 'a name nobody knows gives the first melody').toEqual(readScore(MELODIES[0]?.id));
  expect(readQuick('no-such-tune'), 'and the first quick tune').toEqual(readQuick(QUICK_TUNES[0]?.id));
  // Each melody brings a quick tune of its own, under its own name, so a tree with only a melody chosen has both
  expect(QUICK_TUNES.slice(0, MELODIES.length).map((one) => one.id)).toEqual(MELODIES.map((one) => one.id));
});

test.each(MELODIES.map((melody) => melody.id))('the melody %s is whole, and keeps to its own five notes', (id) => {
  const score = readScore(id);
  expect(score.scale, 'five notes, going up').toHaveLength(5);
  expect(score.scale).toEqual([...score.scale].sort((a, b) => a - b));
  expect(score.lines.length, 'long enough not to wear thin').toBeGreaterThanOrEqual(8);
  const own = new Set(score.scale.map(nameOf));
  for (const line of score.lines) {
    for (const voice of VOICES) expect(line[voice], 'sixteen steps to a line').toHaveLength(16);
    expect([...line.koto, ...line.deep, ...line.drop].every((sound) => !sound || sound.steps === 1), 'only a flute holds a note').toBe(true);
    expect(VOICES.some((voice) => line[voice].some(Boolean)), 'no line is silent').toBe(true);
  }
  const played = [...score.hold.map((pitch) => ({ pitch, lean: false, steps: 1 })), ...soundsOf(score.lines)];
  expect(played.length).toBeGreaterThan(30);
  expect(played.map((sound) => nameOf(sound.pitch)).filter((name) => !own.has(name)), 'notes from outside its scale').toEqual([]);
  expect(played.every((sound) => sound.steps >= 1 && sound.steps <= 16 && sound.pitch > 60 && sound.pitch < 1800)).toBe(true);
});

test.each(QUICK_TUNES.map((tune) => tune.id))('the quick tune %s is whole, keeps to its five notes, and is quick', (id) => {
  const quick = readQuick(id);
  expect(quick.scale, 'five notes, going up').toHaveLength(5);
  expect(quick.scale).toEqual([...quick.scale].sort((a, b) => a - b));
  // It may begin slowly, as long as it is quick by the time it has gathered speed
  expect([quick.tempo >= 80 && quick.quickens >= 100, quick.lines.length >= 4]).toEqual([true, true]);
  for (const line of quick.lines) {
    for (const voice of [...VOICES.map((name) => line[name]), line.drum]) expect(voice, 'sixteen steps to a bar').toHaveLength(16);
    expect(line.drum.filter((beat) => !['X', 'x', 'k', '.'].includes(beat)), 'a drum is struck, struck softly, ticked, or left').toEqual([]);
  }
  const own = new Set(quick.scale.map(nameOf)), played = soundsOf(quick.lines);
  expect(played.map((sound) => nameOf(sound.pitch)).filter((name) => !own.has(name)), 'notes from outside its scale').toEqual([]);
  expect(played.every((sound) => sound.pitch > 60 && sound.pitch < 1800)).toBe(true);
  // Notes a second, over the whole of it
  const seconds = quick.lines.length * 16 * (60 / (quick.tempo * 4));
  expect(played.length / seconds, 'busy enough to be the quick one').toBeGreaterThan(3);
  // One that gathers speed only ever gets quicker, and one that goes back goes back to a bar it has
  expect([quick.quickens >= quick.tempo, quick.quickens <= 170, quick.again >= 0 && quick.again < quick.lines.length]).toEqual([true, true, true]);
});

test('no two quick tunes are the same tune in another scale', () => {
  // What is struck on each step, whatever the pitch, and which way the tune moves from each note to the next.
  // Two tunes with the same answer to both would sound alike.
  const shapeOf = (id: string): string => readQuick(id).lines.map((line) => line.koto.map((_, step) => (
    `${line.koto[step] ? 'k' : ''}${line.flute[step] ? 'f' : ''}${line.drop[step] ? 'b' : ''}${line.deep[step] ? 'd' : ''}${line.drum[step] === '.' ? '' : line.drum[step]}` || '-'
  )).join(' ')).join(' | ');
  const turnsOf = (id: string): string => {
    const pitches = readQuick(id).lines.flatMap((line) => [...line.koto, ...line.flute, ...line.drop].flatMap((sound) => (sound ? [sound.pitch] : [])));
    return pitches.slice(1).map((pitch, at) => (pitch > (pitches[at] ?? 0) ? 'u' : pitch < (pitches[at] ?? 0) ? 'd' : '=')).join('');
  };
  const ids = QUICK_TUNES.map((tune) => tune.id);
  expect(new Set(ids.map(shapeOf)).size, 'each has a rhythm of its own').toBe(ids.length);
  expect(new Set(ids.map(turnsOf)).size, 'and a tune of its own').toBe(ids.length);

  // Nor are they one scale moved up or down: the steps between a scale's notes are what give it its colour
  const colourOf = (id: string): string => readQuick(id).scale.slice(1).map((pitch, at, rest) => Math.round(12 * Math.log2(pitch / (at ? rest[at - 1] ?? pitch : readQuick(id).scale[0] ?? pitch)))).join('-');
  expect(new Set(ids.map(colourOf)).size, 'between them they use many different scales').toBeGreaterThanOrEqual(6);
  // Which instrument carries each tune, and what plays under it
  const voicesOf = (id: string): string => VOICES.filter((voice) => readQuick(id).lines.some((line) => line[voice].some(Boolean))).join('+');
  expect(new Set(ids.map((id) => `${voicesOf(id)} ${readQuick(id).sharp} ${readQuick(id).bright}`)).size, 'and many different groups of instruments').toBeGreaterThanOrEqual(5);
});
