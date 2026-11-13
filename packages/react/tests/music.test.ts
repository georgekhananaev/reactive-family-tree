/*
 * The melodies are written out by hand, so a slip of the pen is the likely way
 * for one to go wrong: a note from outside its scale, or a line a step short.
 */

import { expect, test } from 'vitest';

import { MELODIES, readScore } from '../src/music';

const NAMES = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
/* The name of the note a pitch is, whatever its octave. */
const nameOf = (hertz: number): string => NAMES[((Math.round(12 * Math.log2(hertz / 440)) % 12) + 12) % 12] ?? '?';

test('there are melodies to choose from, each known by a name a setting can hold', () => {
  expect(MELODIES.length).toBeGreaterThanOrEqual(5);
  expect(new Set(MELODIES.map((melody) => melody.id)).size, 'no two share an id').toBe(MELODIES.length);
  for (const melody of MELODIES) {
    // The same shape the server asks of the setting
    expect(melody.id).toMatch(/^[a-z][a-z-]{0,39}$/);
    expect([melody.name.length > 0, melody.about.endsWith('.')]).toEqual([true, true]);
  }
  expect(readScore('no-such-melody'), 'a name nobody knows gives the first melody').toEqual(readScore(MELODIES[0]?.id));
});

test.each(MELODIES.map((melody) => melody.id))('%s is whole, and keeps to its own five notes', (id) => {
  const score = readScore(id);
  expect(score.scale, 'five notes, going up').toHaveLength(5);
  expect(score.scale).toEqual([...score.scale].sort((a, b) => a - b));
  expect(score.lines.length, 'long enough not to wear thin').toBeGreaterThanOrEqual(8);
  const own = new Set(score.scale.map(nameOf));
  const played = [...score.hold.map((pitch) => ({ pitch, lean: false, steps: 1 }))];
  for (const line of score.lines) {
    for (const voice of [line.koto, line.deep, line.flute, line.drop]) {
      expect(voice, 'sixteen steps to a line').toHaveLength(16);
      played.push(...voice.filter((sound) => sound !== null));
    }
    expect([...line.koto, ...line.deep, ...line.drop].every((sound) => !sound || sound.steps === 1), 'only a flute holds a note').toBe(true);
    expect([...line.koto, ...line.deep, ...line.flute, ...line.drop].some(Boolean), 'no line is silent').toBe(true);
  }
  expect(played.length).toBeGreaterThan(30);
  expect(played.map((sound) => nameOf(sound.pitch)).filter((name) => !own.has(name)), 'notes from outside its scale').toEqual([]);
  expect(played.every((sound) => sound.steps >= 1 && sound.steps <= 16 && sound.pitch > 60 && sound.pitch < 1800)).toBe(true);
});
