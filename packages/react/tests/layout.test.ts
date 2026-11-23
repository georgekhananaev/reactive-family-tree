/*
 * Nobody's name may be written over someone else's, however many people a
 * generation has. The tree is drawn in a browser, but where everyone stands
 * and where each name goes is plain arithmetic, and can be checked here on
 * families made up for the purpose: a small one, a crowded one, couples with
 * long names, people with no birth year.
 */

import { expect, test } from 'vitest';

import { LEAF_BODY, NAME_SIZE, arrange, clashesIn, drawingOf, linesOf, placeNames, ringsFor, smallRings, widthOf } from '../src/layout';
import type { Fork, Hung, Leafage, NameTag } from '../src/layout';

interface Kin extends Fork<Kin> {
  hung: Hung[];
}

const NAMES = ['Ada', 'Bo', 'Konstantin', 'Maximilian', 'Anna Maria', 'Chaya Rivka', 'Eliyahu', 'Li', 'Bat-El', 'Alexander', 'Rina', 'Yitzhak', 'Zoya', 'Tamara', 'Hananya'];

/* A number from 0 to 1 that is always the same for the same words, as the tree's own is. */
function chance(id: string, salt: string): number {
  let h = 2166136261;
  for (const letter of `${id}|${salt}`) h = Math.imul(h ^ letter.charCodeAt(0), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

const tagOf = (name: string, years: boolean): NameTag => {
  const lines = linesOf(name);
  return { lines, years, width: Math.max(...lines.map((line) => widthOf(line, NAME_SIZE)), years ? widthOf('1926–2010', 16) : 0) };
};

/*
 * A family with so many children in each generation. Whoever has children has
 * a partner, and so do half of the rest. One in four has no birth year.
 */
function family(childrenEach: readonly number[]): Kin {
  let born = 0;
  const grow = (depth: number): Kin => {
    const id = `p${born++}`, pick = (salt: string): number => chance(id, salt);
    const children = Array.from({ length: childrenEach[depth] ?? 0 }, () => grow(depth + 1));
    const offsets = children.length || pick('wed') > 0.5 ? [-0.66, 0.66] : [0];
    const hung = offsets.map((offset, i) => ({ offset, scale: 1, tag: tagOf(NAMES[Math.floor(pick(`name${i}`) * NAMES.length)], pick(`years${i}`) > 0.25) }));
    return { id, depth, children, hung, count: 0, weight: 0, ttheta: 0, tx: 0, ty: 0 };
  };
  return grow(0);
}

const clashesOn = (root: Kin, rings: readonly number[]): number => {
  arrange(root, rings, chance);
  const { leaves, twigs, knots } = drawingOf(root, chance);
  return clashesIn(leaves, placeNames(leaves, twigs, knots)).length;
};

test('a small family stands where it always has, on a small tree’s rings', () => {
  const root = family([3, 2, 1]);
  expect(ringsFor(root, chance)).toEqual(smallRings(4));
  expect(clashesOn(root, smallRings(4))).toBe(0);
});

test('a crowded family does not fit on a small tree, so its tree grows until no name is over another', () => {
  const root = family([5, 4, 3, 2]);
  const small = smallRings(5);
  expect(clashesOn(root, small)).toBeGreaterThan(0);
  const rings = ringsFor(root, chance);
  expect(clashesOn(root, rings)).toBe(0);
  // Further out, and each ring still beyond the one inside it by at least a small tree's step
  rings.forEach((ring, depth) => {
    expect(ring).toBeGreaterThanOrEqual(small[depth]);
    if (depth) expect(ring - rings[depth - 1]).toBeGreaterThanOrEqual(small[depth] - small[depth - 1] - 1e-6);
  });
  expect(rings[4]).toBeGreaterThan(small[4]);
});

test('a roomier tree sets everyone further out, and a tighter one draws them in', () => {
  const root = family([3, 2, 1]);
  const reach = (by: number): number => {
    arrange(root, smallRings(4).map((ring) => ring * by), chance);
    return Math.hypot(root.children[0].children[0].tx, root.children[0].children[0].ty);
  };
  const [tight, normal, roomy] = [reach(0.7), reach(1), reach(1.5)];
  expect(tight).toBeLessThan(normal - 60);
  expect(roomy).toBeGreaterThan(normal + 120);
});

test('a couple is given the room of two, and their long names stand clear of each other', () => {
  const single: Kin = { id: 'a', depth: 1, children: [], hung: [{ offset: 0, scale: 1, tag: tagOf('Konstantin', true) }], count: 0, weight: 0, ttheta: 0, tx: 0, ty: 0 };
  const couple: Kin = { id: 'b', depth: 1, children: [], count: 0, weight: 0, ttheta: 0, tx: 0, ty: 0, hung: [{ offset: -0.66, scale: 1, tag: tagOf('Konstantin', true) }, { offset: 0.66, scale: 1, tag: tagOf('Maximilian', true) }] };
  const root: Kin = { id: 'r', depth: 0, children: [single, couple], hung: [{ offset: 0, scale: 1, tag: tagOf('Ada', true) }], count: 0, weight: 0, ttheta: 0, tx: 0, ty: 0 };
  arrange(root, smallRings(2), chance);
  expect(couple.weight).toBeGreaterThan(single.weight * 1.6);
  const { leaves, twigs, knots } = drawingOf(root, chance);
  expect(clashesIn(leaves, placeNames(leaves, twigs, knots))).toEqual([]);
});

test('with no birth year, a name sits right at its leaf and keeps no empty line for the years', () => {
  const upright = (tag: NameTag): Leafage => ({ x: 0, y: 0, angle: 0, scale: 1, body: LEAF_BODY, face: false, tag });
  const tip = -(LEAF_BODY.reach + 12);
  const [dated] = placeNames([upright(tagOf('Rina', true))]), [undated] = placeNames([upright(tagOf('Rina', false))]);
  // Both are written just above the tip of the leaf. The dated one is taller by its line of years.
  expect(dated!.bottom).toBeCloseTo(tip + 1, 0);
  expect(tip - undated!.bottom).toBeLessThan(8);
  expect(dated!.bottom - dated!.top).toBeGreaterThan(undated!.bottom - undated!.top + 15);
  // And a short name with no years is only as wide as its letters
  expect(undated!.right - undated!.left).toBeCloseTo(widthOf('Rina', NAME_SIZE), 5);
});

test('a long name of two words is written on two lines, and a short one on one', () => {
  expect(linesOf('Chaya Rivka')).toEqual(['Chaya', 'Rivka']);
  expect(linesOf('Maria de la Paz')).toEqual(['Maria de', 'la Paz']);
  expect(linesOf('Esti Ella')).toEqual(['Esti Ella']);
  expect(linesOf('Maximilian')).toEqual(['Maximilian']);
  const [box] = placeNames([{ x: 0, y: 0, angle: 0, scale: 1, body: LEAF_BODY, face: false, tag: tagOf('Chaya Rivka', true) }]);
  expect(box!.lineDy).toHaveLength(2);
  expect(box!.lineDy[1]).toBeGreaterThan(box!.lineDy[0]);
  expect(box!.yearsDy).toBeGreaterThan(box!.lineDy[1]);
});

test('a name gives way to one already written, and to a leaf, when there is a free spot', () => {
  const at = (x: number, name: string): Leafage => ({ x, y: 0, angle: 0, scale: 1, body: LEAF_BODY, face: false, tag: tagOf(name, true) });
  // Two leaves side by side, closer than their names are wide
  const leaves = [at(0, 'Konstantin'), at(70, 'Maximilian')];
  expect(clashesIn(leaves, placeNames(leaves))).toEqual([]);
});
