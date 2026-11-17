/*
 * Does the family still make sense after an edit?
 *
 * Errors block the edit. Warnings are returned to the author and shown to
 * reviewers, because family history is full of true things that look wrong.
 */

import { ancestorsOf, bornYear, diedYear, fullName, indexOf, livingChildren, livingPartners, namesOf, person, present } from './graph';
import { sayFrom } from './lang';
import type { Lang } from './lang';
import type { Change, Issue, State, Validation } from './types';
import { say } from './words';
import type { Phrase } from './words';

/*
 * The issues that say a year or an age. They are worked out from a birth or a death, and either can be kept more
 * private than the person it belongs to, so these are told only to someone who may see those too.
 */
export const DATED_ISSUES: ReadonlySet<string> = new Set(['died_before_born', 'long_life', 'parent_younger_than_child', 'unlikely_parent_age']);

export function validate(state: State, changes: readonly Change[]): Validation {
  const ix = indexOf(state);
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  /*
   * An issue is found once and read by many: its author now, a reviewer later. So beside the English
   * sentence it keeps the sentence's parts, and `issueText` says it again in each reader's language.
   * `names` are the people in its gaps, by id. `people` are those it gives away, who decide who may read it.
   */
  const issue = (code: string, phrase: Phrase, names: Record<string, string>, values: Record<string, number>, people: string[]): Issue => {
    // The names as they read now, for someone who exists only in this edit and cannot be looked up later
    const as = Object.fromEntries(Object.entries(names).map(([gap, id]) => [gap, fullName(person(state, id))]));
    return { code, message: sayFrom(null, 'en', phrase, { ...values, ...as }), people, said: { phrase, names, values, as } };
  };
  const warn = (...parts: Parameters<typeof issue>) => warnings.push(issue(...parts));

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
      errors.push(issue('own_ancestor', 'That would make {name} their own ancestor. Check who you connected.', { name: id }, {}, [id]));
    }
    if (born !== null && died !== null && died < born) {
      errors.push(issue('died_before_born', '{name} cannot have died ({died}) before being born ({born}).', { name: id }, { died, born }, [id]));
    }
    if (born !== null && died !== null && died - born > 125) {
      warn('long_life', '{name} is recorded as living {years} years.', { name: id }, { years: died - born }, [id]);
    }
    for (const union of ix.unionsOfChild.get(id) ?? []) {
      for (const parentId of livingPartners(state, union)) {
        const parentBorn = bornYear(ix, parentId);
        if (born === null || parentBorn === null) continue;
        const age = born - parentBorn;
        if (age <= 0) warn('parent_younger_than_child', '{parent} (born {parentBorn}) is recorded as a parent of {name} (born {born}).', { parent: parentId, name: id }, { parentBorn, born }, [parentId, id]);
        else if (age < 12 || age > 80) warn('unlikely_parent_age', '{parent} would have been {age} when {name} was born.', { parent: parentId, name: id }, { age }, [parentId, id]);
      }
    }
  }

  // A new person who looks like someone already on the tree
  for (const change of changes) {
    const fresh = change.after;
    if (change.kind !== 'people' || change.before || !('given' in fresh) || !fresh.given) continue;
    const born = bornYear(ix, fresh.id);
    // Someone may be on the tree under the same name in another language
    const spelled = (p: Parameters<typeof namesOf>[0]) => namesOf(p).map((name) => `${name.given}\n${name.family}`.toLowerCase());
    const mine = new Set(spelled(fresh));
    for (const other of state.people.values()) {
      if (other.id === fresh.id || !present(other)) continue;
      const sameName = spelled(other).some((name) => mine.has(name));
      const otherBorn = bornYear(ix, other.id);
      const closeYear = born === null || otherBorn === null || Math.abs(born - otherBorn) <= 2;
      // The name is the author's own, but the warning gives away that the other person is there
      if (sameName && closeYear) warn('possible_duplicate', '{name} looks like someone already on the tree. Same person?', { name: fresh.id }, {}, [other.id]);
    }
  }

  return { errors, warnings };
}

/*
 * An issue in the reader's language, with each person named as the reader reads them. `nameOf` gives
 * nothing for someone it cannot find, such as a person who exists only in a waiting edit, and they are
 * named as they were when the issue was found. One from before issues kept their parts is read as it was written.
 */
export function issueText(found: Issue, lang: Lang, nameOf: (id: string) => string | null): string {
  if (!found.said) return found.message;
  const { phrase, names, values, as } = found.said;
  return say(lang, phrase as Phrase, { ...values, ...Object.fromEntries(Object.entries(names).map(([gap, id]) => [gap, nameOf(id) ?? as[gap] ?? ''])) });
}
