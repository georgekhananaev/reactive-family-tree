/* Questions about the tree as the browser holds it: the copy the server allowed this viewer to see. */

export function displayName(person) {
  if (!person) return 'Unknown';
  if (person.masked) return 'Living relative';
  return [person.given, person.family].filter(Boolean).join(' ') || 'Unknown';
}

/* The lookup that the shared "add a relative" builder needs. */
export function lookupFrom(tree) {
  const brief = (union) => union && { id: union.id, partners: union.partners };
  return {
    unionsOf: (personId) => tree.unions.filter((u) => u.partners.includes(personId) && !u.pending).map(brief),
    birthUnion: (personId) => brief(tree.unions.find((u) => !u.pending && u.children.some((c) => c.id === personId))) ?? null,
  };
}

/* Everyone in a branch: the anchor, every descendant, and their partners. */
export function branchOf(tree, anchorId) {
  const members = new Set();
  const queue = [anchorId];
  while (queue.length) {
    const id = queue.pop();
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
