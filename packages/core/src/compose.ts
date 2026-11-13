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

import { parseDate } from './dates';
import type { Living, Op, Ref, Relation, Sex, Union } from './types';

export const RELATIONS: readonly Relation[] = ['child', 'partner', 'parent', 'sibling'];

export class ComposeError extends Error {}

/* A partnership, as far as this module needs to know it. */
type Couple = Pick<Union, 'id' | 'partners'>;

export interface FamilyLookup {
  unionsOf(personId: string): Couple[];
  birthUnion(personId: string): Couple | null;
}

/* What a person typed about a new relative. The dates are words, read by `parseDate`. */
export interface RelativeDetails {
  given: string;
  family: string;
  birthName: string;
  sex: Sex;
  living?: Living;
  born?: string | null;
  died?: string | null;
  birthPlace?: string | null;
}

/* Birth and death facts for someone, from what a person typed. */
function lifeFacts(subject: Ref, { born, died, birthPlace }: Pick<RelativeDetails, 'born' | 'died' | 'birthPlace'>): Op[] {
  const ops: Op[] = [];
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
export function addRelative(
  family: FamilyLookup,
  { of, relation, details, unionId = null }: { of: string; relation: Relation; details: RelativeDetails; unionId?: string | null },
): { ops: Op[]; ref: string } {
  if (!RELATIONS.includes(relation)) throw new ComposeError('A relative is a child, partner, parent or sibling.');
  const fresh = '$new';
  const { born, died, birthPlace, ...set } = details;
  if (!set.living) set.living = died ? 'no' : 'unknown';
  const ops: Op[] = [{ type: 'person.create', ref: fresh, set }, ...lifeFacts(fresh, { born, died, birthPlace })];
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
export function relativeMessage(relation: Relation, details: Pick<RelativeDetails, 'given' | 'family'>, ofName: string): string {
  const name = [details.given, details.family].filter(Boolean).join(' ') || 'someone';
  return `Add ${name} as ${relation} of ${ofName}`;
}
