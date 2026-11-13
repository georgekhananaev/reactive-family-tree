/*
 * The family as a graph, and the questions we ask of it.
 *
 * State is four maps of plain objects:
 *   people    id -> { id, rev, given, family, birthName, sex, living, privacy, bio, consentAt, deletedAt }
 *   unions    id -> { id, rev, kind, status, host, since, partners: [personId], children: [{ id, kind }], deletedAt }
 *   facts     id -> { id, rev, subject: { type, id }, type, date, place, value, note, certainty, privacy, deletedAt }
 *   memories  id -> { id, personId, authorUserId, authorName, body, createdAt, deletedAt }
 *
 * Removed things keep their place with `deletedAt` set (the compost), and every
 * question here ignores them. Pure functions, shared by the server and the browser.
 */

import { sortKey, yearOf } from './dates';
import type { ChildLink, Fact, FactType, PathStep, Person, Scope, State, Union } from './types';

/* The lookup table that `indexOf` builds. */
export interface FamilyIndex {
  unionsOfPartner: Map<string, Union[]>;
  unionsOfChild: Map<string, Union[]>;
  factsOfSubject: Map<string, Fact[]>;
}

export function emptyState(): State {
  return { people: new Map(), unions: new Map(), facts: new Map(), memories: new Map() };
}

function cloneMap<T>(map: Map<string, T>): Map<string, T> {
  const copy = new Map<string, T>();
  for (const [id, entity] of map) copy.set(id, structuredClone(entity));
  return copy;
}

export function cloneState(state: State): State {
  return { people: cloneMap(state.people), unions: cloneMap(state.unions), facts: cloneMap(state.facts), memories: cloneMap(state.memories) };
}

export const present = <T extends { deletedAt: string | null }>(entity: T | null | undefined): entity is T => Boolean(entity && !entity.deletedAt);

export function person(state: State, id: string): Person | null {
  const found = state.people.get(id);
  return present(found) ? found : null;
}

/* A lookup table built once per question, so walking the family is cheap. */
export function indexOf(state: State): FamilyIndex {
  const unionsOfPartner = new Map<string, Union[]>();
  const unionsOfChild = new Map<string, Union[]>();
  const factsOfSubject = new Map<string, Fact[]>();
  const push = <T>(map: Map<string, T[]>, key: string, value: T) => {
    const list = map.get(key);
    if (list) list.push(value);
    else map.set(key, [value]);
  };

  for (const union of state.unions.values()) {
    if (!present(union)) continue;
    for (const id of union.partners) if (person(state, id)) push(unionsOfPartner, id, union);
    for (const child of union.children) if (person(state, child.id)) push(unionsOfChild, child.id, union);
  }
  for (const fact of state.facts.values()) {
    if (present(fact)) push(factsOfSubject, fact.subject.id, fact);
  }
  for (const list of factsOfSubject.values()) list.sort((a, b) => (sortKey(a.date) ?? 0) - (sortKey(b.date) ?? 0));
  return { unionsOfPartner, unionsOfChild, factsOfSubject };
}

export const unionsOf = (ix: FamilyIndex, personId: string): Union[] => ix.unionsOfPartner.get(personId) ?? [];
export const birthUnions = (ix: FamilyIndex, personId: string): Union[] => ix.unionsOfChild.get(personId) ?? [];
export const factsOf = (ix: FamilyIndex, subjectId: string): Fact[] => ix.factsOfSubject.get(subjectId) ?? [];

export function livingPartners(state: State, union: Union): string[] {
  return union.partners.filter((id) => person(state, id));
}

export function livingChildren(state: State, union: Union): ChildLink[] {
  return union.children.filter((child) => person(state, child.id));
}

export function parentsOf(state: State, ix: FamilyIndex, personId: string): string[] {
  return birthUnions(ix, personId).flatMap((union) => livingPartners(state, union));
}

export function childrenOf(state: State, ix: FamilyIndex, personId: string): string[] {
  return unionsOf(ix, personId).flatMap((union) => livingChildren(state, union).map((child) => child.id));
}

export function partnersOf(state: State, ix: FamilyIndex, personId: string): string[] {
  return unionsOf(ix, personId).flatMap((union) => livingPartners(state, union).filter((id) => id !== personId));
}

function walk(start: string, next: (id: string) => string[]): Set<string> {
  const seen = new Set<string>();
  const queue = [...next(start)];
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...next(id));
  }
  return seen;
}

const descendantsOf = (state: State, ix: FamilyIndex, personId: string) => walk(personId, (id) => childrenOf(state, ix, id));
export const ancestorsOf = (state: State, ix: FamilyIndex, personId: string): Set<string> => walk(personId, (id) => parentsOf(state, ix, id));

/*
 * A branch is an anchor, every descendant (the core), and the partners of
 * those people. The difference matters only for edits that connect people.
 */
export function scopeOf(state: State, ix: FamilyIndex, anchors: readonly string[]): Scope {
  const core = new Set<string>();
  for (const anchor of anchors) {
    if (!person(state, anchor)) continue;
    core.add(anchor);
    for (const id of descendantsOf(state, ix, anchor)) core.add(id);
  }
  const partners = new Set<string>();
  for (const id of core) {
    for (const partner of partnersOf(state, ix, id)) if (!core.has(partner)) partners.add(partner);
  }
  return { core, partners };
}

export function firstFact(ix: FamilyIndex, subjectId: string, type: FactType): Fact | null {
  return factsOf(ix, subjectId).find((fact) => fact.type === type) ?? null;
}

export const bornYear = (ix: FamilyIndex, personId: string): number | null => yearOf(firstFact(ix, personId, 'birth')?.date);
export const diedYear = (ix: FamilyIndex, personId: string): number | null => yearOf(firstFact(ix, personId, 'death')?.date);

export function fullName(p: Pick<Person, 'given' | 'family'> | null | undefined): string {
  if (!p) return 'Unknown';
  const name = [p.given, p.family].filter(Boolean).join(' ');
  return name || 'Unknown';
}

/* The partner whose branch a couple is drawn on. */
export function hostOf(state: State, union: Union): string | null {
  const partners = livingPartners(state, union);
  return union.host !== null && partners.includes(union.host) ? union.host : partners[0] ?? null;
}

/* The chain of relatives between two people, or null if they are not connected. */
export function pathBetween(state: State, ix: FamilyIndex, fromId: string, toId: string): PathStep[] | null {
  const step = (id: string): { to: string; how: PathStep['how'] }[] => [
    ...parentsOf(state, ix, id).map((to) => ({ to, how: 'parent' as const })),
    ...childrenOf(state, ix, id).map((to) => ({ to, how: 'child' as const })),
    ...partnersOf(state, ix, id).map((to) => ({ to, how: 'partner' as const })),
  ];
  const cameFrom = new Map<string, { from: string; how: PathStep['how'] } | null>([[fromId, null]]);
  const queue = [fromId];
  for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
    if (id === toId) break;
    for (const edge of step(id)) {
      if (cameFrom.has(edge.to)) continue;
      cameFrom.set(edge.to, { from: id, how: edge.how });
      queue.push(edge.to);
    }
  }
  if (!cameFrom.has(toId)) return null;
  const path: PathStep[] = [];
  for (let id = toId, via = cameFrom.get(id); via; id = via.from, via = cameFrom.get(id)) path.unshift({ person: id, how: via.how });
  return path;
}
