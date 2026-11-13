/*
 * Who may see whom. The living are protected: these rules run on the server
 * for every read (tree, search, person page, export, AI), and the safe answer
 * is the default.
 */

import { bornYear, childrenOf, firstFact } from './graph';
import type { FamilyIndex } from './graph';
import type { Actor, Fact, Person, RuleSettings, Scope, State } from './types';

/* What these rules need to know about whoever is looking. */
type Viewer = Pick<Actor, 'role' | 'personId' | 'visitor'>;

export const isAdmin = (viewer: Pick<Actor, 'role'>): boolean => viewer.role === 'owner' || viewer.role === 'admin';

/* No death recorded and plausibly alive. The age is the admin's setting. */
export function isLiving(state: State, ix: FamilyIndex, p: Person, settings: RuleSettings, thisYear: number): boolean {
  if (p.living === 'no' || firstFact(ix, p.id, 'death')) return false;
  if (p.living === 'yes') return true;
  const born = bornYear(ix, p.id);
  if (born !== null) return thisYear - born < settings.livingAge;
  const childYears = childrenOf(state, ix, p.id).map((id) => bornYear(ix, id)).filter((year) => year !== null);
  return !childYears.some((year) => thisYear - year > settings.livingAge - 20);
}

function isMinor(ix: FamilyIndex, p: Person, thisYear: number): boolean {
  const born = bornYear(ix, p.id);
  return born !== null && thisYear - born < 18;
}

/*
 * 'full' or 'masked'. A masked person keeps their place in the tree's shape
 * but nothing identifying leaves the server.
 *
 * viewer: { role, personId, visitor }, scope: the viewer's branches
 */
export function viewOf(state: State, ix: FamilyIndex, viewer: Viewer, scope: Scope, p: Person, settings: RuleSettings, thisYear: number): 'full' | 'masked' {
  if (isAdmin(viewer) || viewer.personId === p.id) return 'full';
  const inBranch = scope.core.has(p.id) || scope.partners.has(p.id);
  if (!viewer.visitor) return p.privacy === 'private' && !inBranch ? 'masked' : 'full';

  if (isLiving(state, ix, p, settings, thisYear)) {
    // Living people are shown to strangers only if they chose it themselves, and never children
    const choseIt = settings.visibility === 'public' && p.privacy === 'public' && p.consentAt && !isMinor(ix, p, thisYear);
    return choseIt ? 'full' : 'masked';
  }
  return p.privacy === 'members' || p.privacy === 'private' ? 'masked' : 'full';
}

/* A fact can be more private than the person it is about. */
export function factVisible(viewer: Viewer, scope: Scope, fact: Pick<Fact, 'privacy'>, personId: string): boolean {
  if (fact.privacy === 'private') return isAdmin(viewer) || viewer.personId === personId || scope.core.has(personId) || scope.partners.has(personId);
  if (fact.privacy === 'members') return !viewer.visitor;
  return true;
}
