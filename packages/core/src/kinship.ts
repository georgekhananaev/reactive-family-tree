/*
 * Naming a relationship: "your great-aunt", "your first cousin once removed".
 *
 * Given the chain of steps from you to someone (each step is to a parent, a
 * child or a partner), say what they are to you in plain words. Returns null
 * when the chain is not one of the simple shapes, and the caller then shows
 * the chain itself.
 */

import type { KinStep, Sex } from './types';

const ORDINALS = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
const REMOVED = ['', ' once removed', ' twice removed'];

const greats = (count: number) => 'great-'.repeat(Math.max(0, count));
const bySex = (sex: Sex, female: string, male: string, either: string) => (sex === 'female' ? female : sex === 'male' ? male : either);

/* `ups` generations up from you to the ancestor you share, then `downs` back down to them. */
function bloodTerm(ups: number, downs: number, sex: Sex): string {
  if (ups === 0) return `${downs > 1 ? `${greats(downs - 2)}grand` : ''}${bySex(sex, 'daughter', 'son', 'child')}`;
  if (downs === 0) return `${ups > 1 ? `${greats(ups - 2)}grand` : ''}${bySex(sex, 'mother', 'father', 'parent')}`;
  if (ups === 1 && downs === 1) return bySex(sex, 'sister', 'brother', 'sibling');
  if (downs === 1) return `${greats(ups - 2)}${bySex(sex, 'aunt', 'uncle', 'aunt or uncle')}`;
  if (ups === 1) return `${greats(downs - 2)}${bySex(sex, 'niece', 'nephew', 'niece or nephew')}`;
  const degree = Math.min(ups, downs) - 1, removed = Math.abs(ups - downs);
  return `${ORDINALS[degree] ?? `${degree}th`} cousin${REMOVED[removed] ?? ` ${removed} times removed`}`;
}

/* One step of the chain in a word: "mother", "son", "partner". */
export function stepWord({ how, sex }: KinStep): string {
  if (how === 'partner') return 'partner';
  return how === 'parent' ? bySex(sex, 'mother', 'father', 'parent') : bySex(sex, 'daughter', 'son', 'child');
}

/* Parents then children, nothing else: the shape of every blood relation. */
function upsAndDowns(hows: KinStep['how'][]): { ups: number; downs: number } | null {
  let ups = 0;
  while (hows[ups] === 'parent') ups++;
  const rest = hows.slice(ups);
  return rest.every((how) => how === 'child') ? { ups, downs: rest.length } : null;
}

/*
 * steps: [{ how: 'parent' | 'child' | 'partner', sex }] from you to them.
 * Returns a phrase that follows "is", such as "your grandmother" or "the partner of your uncle".
 */
export function describeKinship(steps: readonly KinStep[]): string | null {
  if (!steps.length) return 'you';
  const hows = steps.map((step) => step.how);
  const them = steps[steps.length - 1];
  if (hows.length === 1 && hows[0] === 'partner') return 'your partner';

  const blood = upsAndDowns(hows);
  if (blood) return `your ${bloodTerm(blood.ups, blood.downs, them.sex)}`;

  // Married in: the partner of one of your relatives
  if (them.how === 'partner') {
    const relative = upsAndDowns(hows.slice(0, -1));
    if (relative) return `the partner of your ${bloodTerm(relative.ups, relative.downs, steps[steps.length - 2].sex)}`;
  }
  // Your partner's side of the family
  if (hows[0] === 'partner') {
    const theirs = upsAndDowns(hows.slice(1));
    if (theirs) return `your partner’s ${bloodTerm(theirs.ups, theirs.downs, them.sex)}`;
  }
  return null;
}
