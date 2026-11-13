/*
 * One leaf: its shapes, and the rule for how it is drawn.
 *
 * Shared by the tree and by the leaf portrait on a person's card, so the two
 * are always the same leaf.
 * Author: George Khananaev
 */

import type { MaskedLeaf, PersonLeaf } from '@reactive-family-tree/core';

export const THIS_YEAR = new Date().getFullYear();

export type ShapeName = 'beech' | 'olive' | 'ginkgo' | 'linden';

export interface LeafShape {
  /* The outline of the blade. */
  d: string;
  /* Its veins. */
  v: string;
}

/* Leaf shapes. Stem at 0,0, tip pointing up. People who marry in bring their own. */
export const SHAPES: Record<ShapeName, LeafShape> = {
  beech: {
    d: 'M0,-8 C-18,-18 -20,-44 0,-64 C20,-44 18,-18 0,-8 Z',
    v: 'M0,-8 L0,-58 M0,-18 L-10,-27 M0,-18 L10,-27 M0,-28 L-12,-38 M0,-28 L12,-38 M0,-38 L-10,-47 M0,-38 L10,-47 M0,-48 L-6,-55 M0,-48 L6,-55',
  },
  olive: {
    d: 'M0,-8 C-10,-20 -11,-46 0,-66 C11,-46 10,-20 0,-8 Z',
    v: 'M0,-8 L0,-60 M0,-24 L-5,-31 M0,-24 L5,-31 M0,-38 L-5,-45 M0,-38 L5,-45',
  },
  ginkgo: {
    d: 'M0,-12 C-8,-18 -28,-28 -31,-44 C-24,-56 -9,-58 -2,-50 L0,-45 L2,-50 C9,-58 24,-56 31,-44 C28,-28 8,-18 0,-12 Z',
    v: 'M0,-12 L-23,-45 M0,-12 L-13,-52 M0,-12 L0,-44 M0,-12 L13,-52 M0,-12 L23,-45',
  },
  linden: {
    d: 'M0,-8 C-10,-6 -26,-16 -24,-36 C-22,-52 -8,-56 0,-66 C8,-56 22,-52 24,-36 C26,-16 10,-6 0,-8 Z',
    v: 'M0,-8 L0,-60 M0,-20 L-14,-30 M0,-20 L14,-30 M0,-32 L-13,-43 M0,-32 L13,-43 M0,-44 L-8,-52 M0,-44 L8,-52',
  },
};

/* How a leaf is drawn: in colour, in gold, as an outline, in pencil, or plain and unnamed. */
export type LeafState = 'masked' | 'pending' | 'ghost' | 'gone' | 'living';

/*
 * As much of a person as their leaf needs. A leaf on the tree has all of it.
 * A person's full details, as their card holds them, are never masked or
 * pencilled, and say so by leaving those two out.
 */
export type LeafSubject = (Pick<PersonLeaf, 'id' | 'given' | 'died' | 'gone'> & Partial<Pick<PersonLeaf, 'masked' | 'pending'>>) | MaskedLeaf;

export function stateOf(person: LeafSubject, year: number): LeafState {
  if (person.masked) return 'masked';
  if (person.pending) return 'pending';
  if (!person.given) return 'ghost';
  if (person.died ? person.died <= year : person.gone) return 'gone';
  return 'living';
}

/* Which of the three golds a leaf turns once its person is remembered. */
export const goldOf = (id: string): number => id.length % 3;
