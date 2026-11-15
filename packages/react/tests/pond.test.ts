/*
 * The ponds beside the tree are drawn from pieces of markup put together by
 * hand, so a slip in one of them would quietly spoil a drawing. In each, koi
 * swim and one can leap, unless nothing may move: then everything rests.
 */

import { expect, test } from 'vitest';

import { PONDS } from '../src/pond';

const count = (markup: string, part: string): number => markup.split(part).length - 1;
/* How many koi swim in each. */
const SWIMMERS = { garden: 6, koi: 3 };

for (const [name, pond] of Object.entries(PONDS) as [keyof typeof PONDS, (typeof PONDS)[keyof typeof PONDS]][]) {
  test(`the ${name} pond: its koi swim round and round, and one can leap`, () => {
    const drawn = pond.markup(false);
    expect(count(drawn, 'repeatCount="indefinite" rotate="auto"')).toBe(SWIMMERS[name]);
    expect(drawn).toContain('class="leap"');
  });

  test(`the ${name} pond: when nothing may move, the koi rest where they are and none leaps`, () => {
    const drawn = pond.markup(true);
    expect(drawn).not.toContain('<animate');
    expect(drawn).not.toContain('class="leap"');
    const koi = drawn.slice(drawn.indexOf('<g class="koi"'), drawn.indexOf('url(#pondSky)'));
    expect(count(koi, '<g transform="translate(')).toBe(SWIMMERS[name]);
  });

  test(`the ${name} pond: every part of the drawing it opens it closes, and every number in it is a number`, () => {
    for (const still of [false, true]) {
      const drawn = pond.markup(still), open: string[] = [];
      for (const [, closing, tag, alone] of drawn.matchAll(/<(\/?)([a-zA-Z]+)[^>]*?(\/?)>/g)) {
        if (alone) continue;
        if (closing) expect(open.pop()).toBe(tag);
        else open.push(tag);
      }
      expect(open).toEqual([]);
      expect(drawn).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  test(`the ${name} pond: a leap starts and ends on its own drawing`, () => {
    // A leap carries the koi 56 along, and its rings spread 21 either side
    for (const { from, to } of pond.lanes) {
      expect(from - 21).toBeGreaterThan(pond.box.x);
      expect(to + 56 + 21).toBeLessThan(pond.box.x + pond.box.w);
    }
  });
}
