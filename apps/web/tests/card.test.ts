/*
 * The shared-link picture: Hebrew words set in the order the eye meets them,
 * and the numbers the tree's card tells.
 */

import type { TreePerson, TreeUnion } from '@reactive-family-tree/core';
import { expect, test } from 'vitest';

import { treeFacts } from '../lib/card/facts';
import { readsRtl, rtlWords } from '../lib/card/rtl';

test('a text reads right to left when its first letter is Hebrew', () => {
  expect(readsRtl('משפחת כהן')).toBe(true);
  expect(readsRtl('1921 משפחת כהן')).toBe(true);
  expect(readsRtl('The Cohen family')).toBe(false);
  expect(readsRtl('Семья Коэн')).toBe(false);
});

test('each Hebrew word is turned, and numbers and Latin words keep their own order', () => {
  expect(rtlWords('עץ משפחה')).toEqual(['ץע', 'החפשמ']);
  expect(rtlWords('50 אנשים · מאז 1898')).toEqual(['50', 'םישנא', '·', 'זאמ', '1898']);
  // A number inside a word stays whole, on the far side of the letters before it
  expect(rtlWords('ב-1921')).toEqual(['1921-ב']);
  // Two Latin words in a row stay together, so they are not swapped
  expect(rtlWords('נולד ב New York')).toEqual(['דלונ', 'ב', 'New York']);
  // A bracket turns with the word it closes
  expect(rtlWords('(כהן)')).toEqual(['(ןהכ)']);
});

const leaf = (id: string, born: number | null = null): TreePerson => ({
  id, given: id, family: '', birthName: '', sex: 'unknown', born, died: null, gone: false, privacy: 'default', portrait: null, pending: null, editing: 'none',
});
const union = (partners: string[], children: string[]): TreeUnion => ({
  id: partners.join('+'), partners, host: null, since: null, status: 'current', kind: 'marriage', pending: null, children: children.map((id) => ({ id, kind: 'birth' })),
});

test('the card counts people, the longest line of generations, and the earliest birth a visitor sees', () => {
  const people = [leaf('a', 1898), leaf('b', 1902), leaf('c', 1930), leaf('d'), leaf('e', 1960), { id: 'masked_1', masked: true } as const];
  const unions = [union(['a', 'b'], ['c']), union(['c', 'd'], ['e', 'masked_1'])];
  expect(treeFacts({ people, unions })).toEqual({ people: 6, generations: 3, since: 1898 });
});

test('a tree with no one in it, and a loop in bad data, still give an answer', () => {
  expect(treeFacts({ people: [], unions: [] })).toEqual({ people: 0, generations: 0, since: null });
  const people = [leaf('a'), leaf('b')];
  expect(treeFacts({ people, unions: [union(['a'], ['b']), union(['b'], ['a'])] }).generations).toBe(2);
});
