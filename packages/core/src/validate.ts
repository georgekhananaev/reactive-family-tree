/*
 * Does the family still make sense after an edit?
 *
 * Errors block the edit. Warnings are returned to the author and shown to
 * reviewers, because family history is full of true things that look wrong.
 */

import { ancestorsOf, bornYear, diedYear, fullName, indexOf, livingChildren, livingPartners, person, present } from './graph';
import type { Change, Issue, State, Validation } from './types';

export function validate(state: State, changes: readonly Change[]): Validation {
  const ix = indexOf(state);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const name = (id: string) => fullName(person(state, id));
  // Each issue says whom it names, so that it can be kept from someone who may not see them
  const warn = (code: string, message: string, people: string[]) => warnings.push({ code, message, people });

  // Everyone the edit touched, directly or through a partnership or a fact
  const touched = new Set<string>();
  const touchedUnions = new Set<string>();
  for (const change of changes) {
    const entity = change.after;
    if (!present(entity)) continue;
    if (change.kind === 'people') touched.add(entity.id);
    if (change.kind === 'unions') touchedUnions.add(entity.id);
    if (change.kind === 'facts' && 'subject' in entity) (entity.subject.type === 'person' ? touched : touchedUnions).add(entity.subject.id);
  }
  for (const id of touchedUnions) {
    const union = state.unions.get(id);
    if (!present(union)) continue;
    for (const partner of livingPartners(state, union)) touched.add(partner);
    for (const child of livingChildren(state, union)) touched.add(child.id);
  }

  // A changed birth date matters to that person's children as well
  for (const id of [...touched]) {
    for (const union of ix.unionsOfPartner.get(id) ?? []) {
      for (const child of livingChildren(state, union)) touched.add(child.id);
    }
  }

  for (const id of touched) {
    const p = person(state, id);
    if (!p) continue;
    const born = bornYear(ix, id);
    const died = diedYear(ix, id);

    if (ancestorsOf(state, ix, id).has(id)) {
      errors.push({ code: 'own_ancestor', message: `That would make ${name(id)} their own ancestor. Check who you connected.`, people: [id] });
    }
    if (born !== null && died !== null && died < born) {
      errors.push({ code: 'died_before_born', message: `${name(id)} cannot have died (${died}) before being born (${born}).`, people: [id] });
    }
    if (born !== null && died !== null && died - born > 125) {
      warn('long_life', `${name(id)} is recorded as living ${died - born} years.`, [id]);
    }
    for (const union of ix.unionsOfChild.get(id) ?? []) {
      for (const parentId of livingPartners(state, union)) {
        const parentBorn = bornYear(ix, parentId);
        if (born === null || parentBorn === null) continue;
        const age = born - parentBorn;
        if (age <= 0) warn('parent_younger_than_child', `${name(parentId)} (born ${parentBorn}) is recorded as a parent of ${name(id)} (born ${born}).`, [parentId, id]);
        else if (age < 12 || age > 80) warn('unlikely_parent_age', `${name(parentId)} would have been ${age} when ${name(id)} was born.`, [parentId, id]);
      }
    }
  }

  // A new person who looks like someone already on the tree
  for (const change of changes) {
    const fresh = change.after;
    if (change.kind !== 'people' || change.before || !('given' in fresh) || !fresh.given) continue;
    const born = bornYear(ix, fresh.id);
    for (const other of state.people.values()) {
      if (other.id === fresh.id || !present(other)) continue;
      const sameName = other.given.toLowerCase() === fresh.given.toLowerCase() && other.family.toLowerCase() === fresh.family.toLowerCase();
      const otherBorn = bornYear(ix, other.id);
      const closeYear = born === null || otherBorn === null || Math.abs(born - otherBorn) <= 2;
      // The name is the author's own, but the warning gives away that the other person is there
      if (sameName && closeYear) warn('possible_duplicate', `${fullName(fresh)} looks like someone already on the tree. Same person?`, [other.id]);
    }
  }

  return { errors, warnings };
}
