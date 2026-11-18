/*
 * The few numbers a shared link to the tree tells: how many people are on it,
 * over how many generations, and since when. They are counted from the tree a
 * visitor sees, so they say nothing a visitor could not count for themselves.
 */

import type { TreeSnapshot } from '@reactive-family-tree/core';

export interface TreeFacts {
  people: number;
  generations: number;
  /* The earliest year of birth a visitor may see, if any. */
  since: number | null;
}

export function treeFacts({ people, unions }: Pick<TreeSnapshot, 'people' | 'unions'>): TreeFacts {
  const parentsOf = new Map<string, string[]>();
  for (const union of unions) {
    for (const child of union.children) parentsOf.set(child.id, [...(parentsOf.get(child.id) ?? []), ...union.partners]);
  }
  // A person's generation: one more than their deepest parent's. A loop in bad data is cut where it closes.
  const depth = new Map<string, number>();
  const generationOf = (id: string, seen: ReadonlySet<string>): number => {
    const known = depth.get(id);
    if (known !== undefined) return known;
    const parents = (parentsOf.get(id) ?? []).filter((parent) => !seen.has(parent));
    const found = 1 + Math.max(0, ...parents.map((parent) => generationOf(parent, new Set([...seen, id]))));
    depth.set(id, found);
    return found;
  };
  const born = people.flatMap((person) => (!person.masked && person.born ? [person.born] : []));
  return {
    people: people.length,
    generations: Math.max(0, ...people.map((person) => generationOf(person.id, new Set()))),
    since: born.length ? Math.min(...born) : null,
  };
}
