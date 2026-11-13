/*
 * Turning an intention ("add Maya as Noa's daughter") into operations.
 *
 * The app's "add relative" form and the AI tools both use this, so they
 * build exactly the same edit for the same intention.
 *
 * family: a small lookup the caller provides, so this works on the server's
 * state and on the browser's copy of the tree alike:
 *   { unionsOf(personId) -> [{ id, partners: [id] }], birthUnion(personId) -> { id, partners: [id] } | null }
 */

import { parseDate } from './dates.js';

export const RELATIONS = ['child', 'partner', 'parent', 'sibling'];

export class ComposeError extends Error {}

/* Birth and death facts for someone, from what a person typed. */
function lifeFacts(subject, { born, died, birthPlace }) {
  const ops = [];
  const birth = parseDate(born);
  if (birth || birthPlace) ops.push({ type: 'fact.add', subject: { type: 'person', id: subject }, set: { type: 'birth', date: birth, place: birthPlace ?? '' } });
  const death = parseDate(died);
  if (death) ops.push({ type: 'fact.add', subject: { type: 'person', id: subject }, set: { type: 'death', date: death } });
  return ops;
}

/*
 * details: { given, family, birthName, sex, living, born, died, birthPlace }
 * unionId: for a child, which of the person's partnerships they belong to
 */
export function addRelative(family, { of, relation, details, unionId = null }) {
  if (!RELATIONS.includes(relation)) throw new ComposeError('A relative is a child, partner, parent or sibling.');
  const fresh = '$new';
  const { born, died, birthPlace, ...set } = details;
  if (!set.living) set.living = died ? 'no' : 'unknown';
  const ops = [{ type: 'person.create', ref: fresh, set }, ...lifeFacts(fresh, { born, died, birthPlace })];
  const unions = family.unionsOf(of);

  if (relation === 'child') {
    let union = unionId ?? unions[0]?.id;
    if (!union) {
      union = '$family';
      ops.push({ type: 'union.create', ref: union, partners: [of], set: { kind: 'unknown' } });
    }
    ops.push({ type: 'child.link', union, child: fresh });
  } else if (relation === 'partner') {
    // Someone with children and no recorded partner: the newcomer takes that empty place
    const open = unionId ? unions.find((u) => u.id === unionId) : null;
    if (open && open.partners.length === 1) ops.push({ type: 'union.add_partner', union: open.id, person: fresh });
    else ops.push({ type: 'union.create', partners: [of, fresh], set: { host: of } });
  } else {
    const born_in = family.birthUnion(of);
    if (relation === 'sibling') {
      if (!born_in) throw new ComposeError('Add a parent first, so the two share one.');
      ops.push({ type: 'child.link', union: born_in.id, child: fresh });
    } else if (!born_in) {
      ops.push({ type: 'union.create', ref: '$family', partners: [fresh], set: { kind: 'unknown' } }, { type: 'child.link', union: '$family', child: of });
    } else if (born_in.partners.length < 2) {
      ops.push({ type: 'union.add_partner', union: born_in.id, person: fresh });
    } else {
      throw new ComposeError('Both parents are already recorded.');
    }
  }
  return { ops, ref: fresh };
}

/* A sentence for the edit's message. */
export function relativeMessage(relation, details, ofName) {
  const name = [details.given, details.family].filter(Boolean).join(' ') || 'someone';
  return `Add ${name} as ${relation} of ${ofName}`;
}
