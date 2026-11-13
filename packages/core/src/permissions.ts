/*
 * Who may change what.
 *
 * The decided rule: edits inside your own branch publish at once, edits
 * anywhere else become suggestions. This module turns that into an answer for
 * each operation: 'apply', 'suggest' or 'deny'. The browser uses it to label
 * the button ("Save" or "Send for review"), the server uses it to enforce.
 *
 * actor: { userId, role: 'owner'|'admin'|'member'|null, personId, anchors: [personId], visitor }
 */

import { childrenOf, indexOf, livingPartners, person, scopeOf } from './graph';
import { isAdmin, isLiving } from './privacy';
import type { Actor, Decision, FactSubject, Op, RuleSettings, State, Step } from './types';

const APPLY: Step = { outcome: 'apply' };
const suggest = (reason: string): Step => ({ outcome: 'suggest', reason });
const deny = (reason: string): Step => ({ outcome: 'deny', reason });

const OUTSIDE = 'This is outside your branch, so it goes to that branch’s steward for review.';
const JOINS = 'Connecting someone from another branch changes that branch too, so it needs review.';

export function decideEdit(state: State, actor: Actor, ops: readonly Op[], settings: RuleSettings, thisYear: number = new Date().getFullYear()): Decision {
  const ix = indexOf(state);
  const scope = scopeOf(state, ix, actor.anchors ?? []);
  const admin = isAdmin(actor);

  // What this edit itself has created so far, by reference
  const newPeople = new Map<string, number>();    // ref -> index of the operation that created them, until they are attached
  const newCore = new Set<string>();              // new people who became descendants in the branch
  const newPartners = new Set<string>();          // new people who became partners in the branch
  const newUnions = new Map<string, boolean>();   // ref -> whether the union has a core partner
  const newFacts = new Set<string>();

  const isCore = (id: string) => scope.core.has(id) || newCore.has(id);
  const reach = (id: string) => {
    if (newPeople.has(id)) return 'new';   // settled at the end: a new person must end up connected
    if (id === actor.personId) return 'self';
    if (isCore(id)) return 'core';
    if (scope.partners.has(id) || newPartners.has(id)) return 'partner';
    return null;
  };
  const attach = (id: string, set: Set<string>) => { newPeople.delete(id); set.add(id); };
  const unionHasCore = (id: string): boolean => {
    const fresh = newUnions.get(id);
    if (fresh !== undefined) return fresh;
    const union = state.unions.get(id);
    return union !== undefined && livingPartners(state, union).some(isCore);
  };
  const subjectInBranch = (subject: FactSubject | undefined): boolean => {
    if (!subject) return false;
    return subject.type === 'union' ? unionHasCore(subject.id) : Boolean(reach(subject.id));
  };

  function decide(op: Op, index: number): Step {
    if (op.type === 'entity.set') return deny('Only undo can put things back.');
    // A photo cannot wait for review, where nobody could look at it first. It is set by whoever may edit the person outright.
    if ((op.type === 'person.update' || op.type === 'person.create') && op.set?.portrait && !admin) {
      const where = op.type === 'person.update' && !actor.visitor ? reach(op.person) : null;
      if (!where || where === 'new') return deny('A photo can be added by the person themselves, their branch’s steward or an admin.');
    }
    if (actor.visitor) {
      if (!settings.visitorsCanSuggest) return deny('Sign in to suggest a change.');
      return op.type.startsWith('memory.') ? deny('Sign in to share a memory.') : suggest('The family will look at it.');
    }

    if (op.type === 'person.update' && op.set?.privacy === 'public' && op.person !== actor.personId) {
      const target = person(state, op.person);
      // Someone added in this same edit is not on the tree yet, so nothing shows they have died: treated as living
      if (op.person.startsWith('$') || (target && isLiving(state, ix, target, settings, thisYear))) {
        return deny('Only a living person can choose to be public, from their own account.');
      }
    }
    if (op.type === 'person.create' && op.set?.privacy === 'public') {
      return deny('Only a living person can choose to be public, from their own account.');
    }
    if (op.type === 'memory.add') return APPLY;
    if (op.type === 'memory.remove') {
      const memory = state.memories.get(op.memory);
      const mine = memory && (memory.authorUserId === actor.userId || memory.personId === actor.personId);
      return admin || mine || (memory && reach(memory.personId)) ? APPLY : deny('Only its author, the person it is about, or a steward can remove a memory.');
    }
    if (admin) return APPLY;

    switch (op.type) {
      case 'person.create':
        if (op.ref) newPeople.set(op.ref, index);
        return op.ref ? APPLY : suggest('A new person has to be connected to someone in your branch.');
      case 'person.update':
        return reach(op.person) ? APPLY : suggest(OUTSIDE);
      case 'person.remove': {
        const where = reach(op.person);
        if (!where) return suggest(OUTSIDE);
        if (where === 'self') return suggest('Removing your own leaf needs an admin.');
        return childrenOf(state, ix, op.person).length ? suggest('Removing someone who has children on the tree needs an admin.') : APPLY;
      }
      case 'person.restore':
        return suggest('Restoring from the compost needs an admin.');
      /*
       * A partner or a child joins the branch, and from then on its steward may
       * edit them. So only someone new, or someone the steward already looks
       * after, can be joined without review. Anyone else on the tree would be
       * pulled out from under their own steward.
       */
      case 'union.create': {
        const partners = op.partners ?? [];
        const hasCore = partners.some(isCore);
        if (op.ref) newUnions.set(op.ref, hasCore);
        if (!hasCore) return suggest(OUTSIDE);
        if (!partners.every(reach)) return suggest(JOINS);
        for (const id of partners) if (newPeople.has(id)) attach(id, newPartners);
        return APPLY;
      }
      case 'union.add_partner':
        if (!unionHasCore(op.union)) return suggest(OUTSIDE);
        if (!reach(op.person)) return suggest(JOINS);
        if (newPeople.has(op.person)) attach(op.person, newPartners);
        return APPLY;
      case 'child.link':
        if (!unionHasCore(op.union)) return suggest(OUTSIDE);
        if (!reach(op.child)) return suggest(JOINS);
        attach(op.child, newCore);
        return APPLY;
      case 'union.update':
      case 'union.remove':
      case 'union.remove_partner':
      case 'child.unlink':
        return unionHasCore(op.union) ? APPLY : suggest(OUTSIDE);
      case 'fact.add':
        if (op.ref) newFacts.add(op.ref);
        return subjectInBranch(op.subject) ? APPLY : suggest(OUTSIDE);
      case 'fact.update':
      case 'fact.remove':
        return newFacts.has(op.fact) || subjectInBranch(state.facts.get(op.fact)?.subject) ? APPLY : suggest(OUTSIDE);
      // The types leave nothing over, but an operation is data and may still be something else
      default:
        return deny(`"${(op as Op).type}" is not an operation.`);
    }
  }

  const steps = ops.map(decide);
  // Someone created but never connected into the branch cannot be published by a steward
  for (const index of newPeople.values()) steps[index] = suggest('A new person has to be connected to someone in your branch.');

  const outcome = steps.some((s) => s.outcome === 'deny') ? 'deny' : steps.some((s) => s.outcome === 'suggest') ? 'suggest' : 'apply';
  const reasons = [...new Set(steps.flatMap((s) => (s.outcome === outcome && s.reason ? [s.reason] : [])))];
  return { outcome, steps, reasons };
}

/* Can this actor publish these operations directly? Reviewers must be able to. */
export function canApply(state: State, actor: Actor, ops: readonly Op[], settings: RuleSettings): boolean {
  return decideEdit(state, actor, ops, settings).outcome === 'apply';
}
