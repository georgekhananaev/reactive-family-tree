/* Small questions about the tree as the browser holds it: the copy the server allowed this viewer to see. */

import type { FamilyLookup, TreePerson, TreeSnapshot } from '@reactive-family-tree/core';

export function displayName(person: TreePerson | null | undefined): string {
  if (!person) return 'Unknown';
  if (person.masked) return 'Living relative';
  return [person.given, person.family].filter(Boolean).join(' ') || 'Unknown';
}

/* The lookup that the shared "add a relative" builder needs. */
export function lookupFrom(tree: Pick<TreeSnapshot, 'unions'>): FamilyLookup {
  const brief = (union: TreeSnapshot['unions'][number]) => ({ id: union.id, partners: union.partners });
  return {
    unionsOf: (personId) => tree.unions.filter((union) => union.partners.includes(personId) && !union.pending).map(brief),
    birthUnion: (personId) => {
      const born = tree.unions.find((union) => !union.pending && union.children.some((child) => child.id === personId));
      return born ? brief(born) : null;
    },
  };
}

/* Everyone in a branch: the anchor, every descendant, and their partners. */
export function branchOf(tree: Pick<TreeSnapshot, 'unions'>, anchorId: string): Set<string> {
  const members = new Set<string>();
  const queue = [anchorId];
  while (queue.length) {
    const id = queue.pop() as string;
    if (members.has(id)) continue;
    members.add(id);
    for (const union of tree.unions) {
      if (!union.partners.includes(id)) continue;
      for (const child of union.children) queue.push(child.id);
    }
  }
  for (const id of [...members]) {
    for (const union of tree.unions) if (union.partners.includes(id)) for (const partner of union.partners) members.add(partner);
  }
  return members;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/* "today, 14:05" or "3 Nov 2026" */
export function when(isoTime: string | null | undefined): string {
  if (!isoTime) return '';
  const date = new Date(isoTime);
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  if (date.toDateString() === new Date().toDateString()) return `today, ${time}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export function lifespan(person: { born?: number | null; died?: number | null }): string {
  if (!person.born) return person.died ? `died ${person.died}` : '';
  return person.died ? `${person.born} to ${person.died}` : `born ${person.born}`;
}

export const initialsOf = (name: string) => name.split(/\s+/).map((word) => word[0]).slice(0, 2).join('');
