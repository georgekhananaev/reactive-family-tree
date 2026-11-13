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

import { sortKey, yearOf } from './dates.js';

export function emptyState() {
  return { people: new Map(), unions: new Map(), facts: new Map(), memories: new Map() };
}

export function cloneState(state) {
  const copy = emptyState();
  for (const kind of Object.keys(copy)) {
    for (const [id, entity] of state[kind]) copy[kind].set(id, structuredClone(entity));
  }
  return copy;
}

export const present = (entity) => Boolean(entity) && !entity.deletedAt;

export function person(state, id) {
  const found = state.people.get(id);
  return present(found) ? found : null;
}

/* A lookup table built once per question, so walking the family is cheap. */
export function indexOf(state) {
  const unionsOfPartner = new Map();
  const unionsOfChild = new Map();
  const factsOfSubject = new Map();
  const push = (map, key, value) => (map.get(key) ?? map.set(key, []).get(key)).push(value);

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

export const unionsOf = (ix, personId) => ix.unionsOfPartner.get(personId) ?? [];
export const birthUnions = (ix, personId) => ix.unionsOfChild.get(personId) ?? [];
export const factsOf = (ix, subjectId) => ix.factsOfSubject.get(subjectId) ?? [];

export function livingPartners(state, union) {
  return union.partners.filter((id) => person(state, id));
}

export function livingChildren(state, union) {
  return union.children.filter((child) => person(state, child.id));
}

export function parentsOf(state, ix, personId) {
  return birthUnions(ix, personId).flatMap((union) => livingPartners(state, union));
}

export function childrenOf(state, ix, personId) {
  return unionsOf(ix, personId).flatMap((union) => livingChildren(state, union).map((child) => child.id));
}

export function partnersOf(state, ix, personId) {
  return unionsOf(ix, personId).flatMap((union) => livingPartners(state, union).filter((id) => id !== personId));
}

function walk(start, next) {
  const seen = new Set();
  const queue = [...next(start)];
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    queue.push(...next(id));
  }
  return seen;
}

const descendantsOf = (state, ix, personId) => walk(personId, (id) => childrenOf(state, ix, id));
export const ancestorsOf = (state, ix, personId) => walk(personId, (id) => parentsOf(state, ix, id));

/*
 * A branch is an anchor, every descendant (the core), and the partners of
 * those people. The difference matters only for edits that connect people.
 */
export function scopeOf(state, ix, anchors) {
  const core = new Set();
  for (const anchor of anchors) {
    if (!person(state, anchor)) continue;
    core.add(anchor);
    for (const id of descendantsOf(state, ix, anchor)) core.add(id);
  }
  const partners = new Set();
  for (const id of core) {
    for (const partner of partnersOf(state, ix, id)) if (!core.has(partner)) partners.add(partner);
  }
  return { core, partners };
}

export function firstFact(ix, subjectId, type) {
  return factsOf(ix, subjectId).find((fact) => fact.type === type) ?? null;
}

export const bornYear = (ix, personId) => yearOf(firstFact(ix, personId, 'birth')?.date);
export const diedYear = (ix, personId) => yearOf(firstFact(ix, personId, 'death')?.date);

export function fullName(p) {
  if (!p) return 'Unknown';
  const name = [p.given, p.family].filter(Boolean).join(' ');
  return name || 'Unknown';
}

/* The partner whose branch a couple is drawn on. */
export function hostOf(state, union) {
  const partners = livingPartners(state, union);
  return partners.includes(union.host) ? union.host : partners[0] ?? null;
}

/* The chain of relatives between two people, or null if they are not connected. */
export function pathBetween(state, ix, fromId, toId) {
  const step = (id) => [
    ...parentsOf(state, ix, id).map((to) => ({ to, how: 'parent' })),
    ...childrenOf(state, ix, id).map((to) => ({ to, how: 'child' })),
    ...partnersOf(state, ix, id).map((to) => ({ to, how: 'partner' })),
  ];
  const cameFrom = new Map([[fromId, null]]);
  const queue = [fromId];
  while (queue.length) {
    const id = queue.shift();
    if (id === toId) break;
    for (const edge of step(id)) {
      if (cameFrom.has(edge.to)) continue;
      cameFrom.set(edge.to, { from: id, how: edge.how });
      queue.push(edge.to);
    }
  }
  if (!cameFrom.has(toId)) return null;
  const path = [];
  for (let id = toId; cameFrom.get(id); id = cameFrom.get(id).from) path.unshift({ person: id, how: cameFrom.get(id).how });
  return path;
}
