/*
 * The whole family as a tree to draw, with nothing hidden.
 *
 * The app never sends this to a browser: there the server decides, person by
 * person, what each viewer may see. This is for a family held entirely in one
 * place already, such as the demo on the project site or a tree embedded with
 * the React package.
 */

import type { FamilyHeader, PersonLeaf, TreeSnapshot, TreeUnion } from './api-types';
import { bornYear, diedYear, hostOf, indexOf, livingChildren, livingPartners, present } from './graph';
import { isLiving } from './privacy';
import type { RuleSettings, State } from './types';

export function openSnapshot(state: State, { family, rootId, settings, year = new Date().getFullYear() }: {
  family: FamilyHeader;
  rootId: string | null;
  settings: RuleSettings;
  year?: number;
}): TreeSnapshot {
  const ix = indexOf(state);
  const people: PersonLeaf[] = [];
  for (const p of state.people.values()) {
    if (!present(p)) continue;
    people.push({
      id: p.id, given: p.given, family: p.family, birthName: p.birthName, sex: p.sex,
      born: bornYear(ix, p.id), died: diedYear(ix, p.id), gone: !isLiving(state, ix, p, settings, year),
      privacy: p.privacy, pending: null, editing: 'none',
    });
  }
  const unions: TreeUnion[] = [];
  for (const union of state.unions.values()) {
    if (!present(union)) continue;
    const partners = livingPartners(state, union);
    if (!partners.length) continue;
    unions.push({ id: union.id, partners, host: hostOf(state, union), since: union.since, status: union.status, kind: union.kind, pending: null, children: livingChildren(state, union) });
  }
  return { seq: 0, family, closed: false, people, unions, rootId: rootId && state.people.has(rootId) ? rootId : people[0]?.id ?? null };
}
