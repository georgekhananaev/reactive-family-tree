/*
 * What a given person is allowed to see: the tree, one person, search results,
 * and the health report. Every read goes through the privacy rules here, so
 * the app, the API and AI clients can never see more than their owner.
 */

import { formatDate } from '../core/dates.js';
import {
  birthUnions, bornYear, childrenOf, cloneState, diedYear, factsOf, firstFact, fullName, hostOf, indexOf,
  livingChildren, livingPartners, parentsOf, partnersOf, pathBetween, person, present, scopeOf, unionsOf,
} from '../core/graph.js';
import { ADDITIVE, applyOps } from '../core/ops.js';
import { factVisible, isAdmin, isLiving, viewOf } from '../core/privacy.js';
import { validate } from '../core/validate.js';
import { forbidden, notFound } from './errors.js';

const thisYear = () => new Date().getFullYear();

export class Views {
  constructor(store, edits) {
    this.store = store;
    this.edits = edits;
  }

  get state() { return this.store.state; }
  get settings() { return this.store.settings; }

  /* Everything needed to answer "who can this viewer see, and how much". */
  lens(actor, state = this.state) {
    const ix = indexOf(state);
    const scope = scopeOf(this.state, indexOf(this.state), actor.anchors);
    const year = thisYear();
    return {
      ix, scope, state,
      view: (p) => viewOf(state, ix, actor, scope, p, this.settings, year),
      living: (p) => isLiving(state, ix, p, this.settings, year),
      // Whether this viewer's change to this person would publish, wait for review, or is not offered at all
      editing: (id) => {
        if (actor.visitor) return this.settings.visitorsCanSuggest ? 'suggest' : 'none';
        return isAdmin(actor) || id === actor.personId || scope.core.has(id) || scope.partners.has(id) ? 'apply' : 'suggest';
      },
    };
  }

  closedTo(actor) {
    return actor.visitor && this.settings.visibility === 'private';
  }

  /*
   * The family with the additions of pending edits drawn in, so a suggested
   * or drafted person can appear on the tree in pencil for those who may see it.
   */
  withPending(actor) {
    const marks = new Map();
    let state = this.state;
    for (const edit of this.edits.pendingFor(actor)) {
      if (!edit.ops.some((op) => op.type === 'person.create')) continue;
      const additions = edit.ops.filter((op) => ADDITIVE.has(op.type) && (op.type !== 'fact.add' || String(op.subject?.id).startsWith('$')));
      const attempt = cloneState(state);
      let counter = 0;
      try {
        const env = { newId: (prefix) => `${prefix}_pending_${edit.id}_${counter++}`, now: edit.createdAt, userId: edit.authorUserId, userName: edit.authorName };
        const { changes } = applyOps(attempt, additions, env);
        for (const change of changes) {
          if (!change.before) marks.set(change.id, { editId: edit.id, by: edit.authorName, status: edit.status });
        }
        state = attempt;
      } catch {
        // This pending edit no longer fits the family as it is now. It is still listed for review.
      }
    }
    return { state, marks };
  }

  /* The whole tree, as much as this viewer may see. */
  tree(actor) {
    const family = { name: this.settings.familyName, description: this.settings.description, visibility: this.settings.visibility };
    if (this.closedTo(actor)) return { seq: this.store.seq, family, closed: true, people: [], unions: [], rootId: null };

    const { state, marks } = this.withPending(actor);
    const lens = this.lens(actor, state);
    const shown = new Map();   // real id -> id sent to the browser
    const people = [];
    let hidden = 0;
    for (const p of state.people.values()) {
      if (!present(p)) continue;
      const pending = marks.get(p.id) ?? null;
      if (!pending && lens.view(p) === 'masked') {
        // Keeps its place in the tree's shape. Nothing identifying is sent, not even the real id.
        const alias = `masked_${++hidden}`;
        shown.set(p.id, alias);
        people.push({ id: alias, masked: true });
        continue;
      }
      shown.set(p.id, p.id);
      people.push({
        id: p.id, given: p.given, family: p.family, birthName: p.birthName, sex: p.sex,
        born: bornYear(lens.ix, p.id), died: diedYear(lens.ix, p.id),
        gone: !lens.living(p), privacy: p.privacy, pending, editing: pending ? 'none' : lens.editing(p.id),
      });
    }

    const unions = [];
    for (const union of state.unions.values()) {
      if (!present(union)) continue;
      const partners = livingPartners(state, union);
      if (!partners.length) continue;
      const anyMasked = partners.some((id) => shown.get(id) !== id);
      unions.push({
        id: union.id, partners: partners.map((id) => shown.get(id)), host: shown.get(hostOf(state, union)),
        since: anyMasked ? null : union.since, status: union.status, kind: union.kind, pending: marks.get(union.id) ?? null,
        children: livingChildren(state, union).map((child) => ({ id: shown.get(child.id), kind: child.kind })),
      });
    }
    const rootId = person(state, this.settings.rootPersonId) ? shown.get(this.settings.rootPersonId) : people[0]?.id ?? null;
    return { seq: this.store.seq, family, closed: false, people, unions, rootId };
  }

  /* One person in full, for the card. */
  person(actor, id) {
    if (this.closedTo(actor)) throw forbidden('This family tree is private.');
    const lens = this.lens(actor);
    const p = person(this.state, id);
    if (!p || lens.view(p) === 'masked') throw notFound('That person is not on the tree, or is private.');
    const { ix } = lens;

    const brief = (personId) => {
      const other = person(this.state, personId);
      if (!other) return null;
      if (lens.view(other) === 'masked') return { id: null, name: 'Living relative', masked: true };
      return { id: other.id, name: fullName(other), born: bornYear(ix, other.id), died: diedYear(ix, other.id) };
    };
    const facts = factsOf(ix, id).filter((fact) => factVisible(actor, lens.scope, fact, id)).map((fact) => ({
      id: fact.id, type: fact.type, date: fact.date, dateText: formatDate(fact.date), place: fact.place,
      value: fact.value, note: fact.note, certainty: fact.certainty, privacy: fact.privacy,
    }));
    const unions = unionsOf(ix, id).map((union) => ({
      id: union.id, kind: union.kind, status: union.status, since: union.since, host: hostOf(this.state, union),
      partner: livingPartners(this.state, union).filter((other) => other !== id).map(brief)[0] ?? null,
      children: livingChildren(this.state, union).map((child) => ({ ...brief(child.id), kind: child.kind })),
    }));
    const born = birthUnions(ix, id)[0] ?? null;
    const siblings = born ? livingChildren(this.state, born).filter((child) => child.id !== id).map((child) => brief(child.id)) : [];
    const memories = [...this.state.memories.values()].filter((m) => present(m) && m.personId === id && !actor.visitor)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({ id: m.id, author: m.authorName, body: m.body, at: m.createdAt, mine: m.authorUserId === actor.userId }));
    const waiting = this.edits.pendingFor(actor).filter((edit) => edit.status === 'suggested' && edit.touched.includes(id))
      .map((edit) => this.edits.present(edit, actor));

    return {
      id, given: p.given, family: p.family, birthName: p.birthName, name: fullName(p), sex: p.sex, living: p.living,
      gone: !lens.living(p), privacy: p.privacy, consented: Boolean(p.consentAt), bio: p.bio,
      born: bornYear(ix, id), died: diedYear(ix, id), facts, unions, siblings, memories, waiting,
      parents: parentsOf(this.state, ix, id).map(brief), parentUnionId: born?.id ?? null,
      isSelf: id === actor.personId, editing: lens.editing(id),
      canRemove: isAdmin(actor) || (lens.editing(id) === 'apply' && id !== actor.personId && !childrenOf(this.state, ix, id).length),
    };
  }

  search(actor, query) {
    if (this.closedTo(actor)) return [];
    const lens = this.lens(actor);
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const results = [];
    for (const p of this.state.people.values()) {
      if (!present(p) || lens.view(p) === 'masked') continue;
      const hay = `${p.given} ${p.family} ${p.birthName} ${bornYear(lens.ix, p.id) ?? ''} ${firstFact(lens.ix, p.id, 'birth')?.place ?? ''}`.toLowerCase();
      if (words.every((word) => hay.includes(word))) {
        results.push({ id: p.id, name: fullName(p), birthName: p.birthName, born: bornYear(lens.ix, p.id), died: diedYear(lens.ix, p.id) });
      }
    }
    return results.slice(0, 25);
  }

  /* How two people are connected, as a chain of relatives. */
  relationship(actor, fromId, toId) {
    const lens = this.lens(actor);
    const visible = (id) => { const p = person(this.state, id); return p && lens.view(p) === 'full'; };
    if (!visible(fromId) || !visible(toId)) throw notFound('One of those people is not on the tree, or is private.');
    const path = pathBetween(this.state, lens.ix, fromId, toId);
    if (!path) return { connected: false, steps: [] };
    return {
      connected: true,
      steps: path.map((step) => {
        const shown = visible(step.person) ? person(this.state, step.person) : null;
        return { how: step.how, name: shown ? fullName(shown) : 'a living relative', sex: shown?.sex ?? 'unknown' };
      }),
    };
  }

  /* Missing or suspicious data, limited to what this person looks after. A to-do list. */
  health(actor) {
    const lens = this.lens(actor);
    const { ix } = lens;
    const mine = (id) => isAdmin(actor) || lens.scope.core.has(id) || lens.scope.partners.has(id) || id === actor.personId;
    const people = [...this.state.people.values()].filter((p) => present(p) && mine(p.id));
    const entry = (p, detail = '') => ({ id: p.id, name: fullName(p), detail });

    const everyone = people.map((p) => ({ kind: 'people', id: p.id, before: p, after: p }));
    const check = validate(this.state, everyone);
    const report = {
      unnamed: people.filter((p) => !p.given).map((p) => entry(p)),
      noBirthDate: people.filter((p) => p.given && bornYear(ix, p.id) === null).map((p) => entry(p)),
      noParents: people.filter((p) => !parentsOf(this.state, ix, p.id).length && !partnersOf(this.state, ix, p.id).length).map((p) => entry(p)),
      suspicious: [...new Map([...check.errors, ...check.warnings].filter((w) => w.code !== 'possible_duplicate').map((w) => [w.message, w])).values()],
    };
    if (isAdmin(actor)) {
      const covered = new Set();
      for (const member of this.edits.auth.members()) {
        const scope = scopeOf(this.state, ix, member.anchors);
        for (const id of [...scope.core, ...scope.partners]) covered.add(id);
      }
      report.withoutSteward = people.filter((p) => !covered.has(p.id)).length;
      report.total = people.length;
    }
    return report;
  }
}
