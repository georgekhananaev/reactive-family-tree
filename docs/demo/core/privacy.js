/*
 * Who may see whom. The living are protected: these rules run on the server
 * for every read (tree, search, person page, export, AI), and the safe answer
 * is the default.
 */

import { bornYear, childrenOf, firstFact } from './graph.js';

export const isAdmin = (viewer) => viewer.role === 'owner' || viewer.role === 'admin';

/* No death recorded and plausibly alive. The age is the admin's setting. */
export function isLiving(state, ix, p, settings, thisYear) {
  if (p.living === 'no' || firstFact(ix, p.id, 'death')) return false;
  if (p.living === 'yes') return true;
  const born = bornYear(ix, p.id);
  if (born !== null) return thisYear - born < settings.livingAge;
  const childYears = childrenOf(state, ix, p.id).map((id) => bornYear(ix, id)).filter((year) => year !== null);
  return !childYears.some((year) => thisYear - year > settings.livingAge - 20);
}

function isMinor(ix, p, thisYear) {
  const born = bornYear(ix, p.id);
  return born !== null && thisYear - born < 18;
}

/*
 * 'full' or 'masked'. A masked person keeps their place in the tree's shape
 * but nothing identifying leaves the server.
 *
 * viewer: { role, personId, visitor }, scope: the viewer's branches
 */
export function viewOf(state, ix, viewer, scope, p, settings, thisYear) {
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
export function factVisible(viewer, scope, fact, personId) {
  if (fact.privacy === 'private') return isAdmin(viewer) || viewer.personId === personId || scope.core.has(personId) || scope.partners.has(personId);
  if (fact.privacy === 'members') return !viewer.visitor;
  return true;
}
