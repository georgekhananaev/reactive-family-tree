/*
 * What a given person is allowed to see: the tree, one person, search results,
 * and the health report. Every read goes through the privacy rules here, so
 * the app, the API and AI clients can never see more than their owner.
 */

import {
  ADDITIVE, applyOps, birthUnions, bornYear, childrenOf, cloneState, diedYear, factVisible, factsOf, firstFact, formatDate, fullName, hostOf, indexOf,
  isAdmin, isLiving, livingChildren, livingPartners, parentsOf, partnersOf, pathBetween, person, present, scopeOf, unionsOf, validate, viewOf,
} from '@reactive-family-tree/core';
import type {
  Actor, Change, HealthEntry, HealthReport, PendingMark, Person, PersonDetail, Reach, Relationship, RelativeBrief, Scope, SearchHit, State, TreePerson, TreeSnapshot, TreeUnion,
} from '@reactive-family-tree/core';

import type { Edits } from './edits';
import { forbidden, notFound } from './errors';
import type { Members } from './members';
import type { FamilyStore } from './store';

const thisYear = () => new Date().getFullYear();

/* Everything needed to answer "who can this viewer see, and how much". */
interface Lens {
  ix: ReturnType<typeof indexOf>;
  scope: Scope;
  view(p: Person): 'full' | 'masked';
  living(p: Person): boolean;
  /* Whether this viewer's change to this person would publish, wait for review, or is not offered at all. */
  editing(id: string): Reach;
}

export class Views {
  constructor(
    private readonly store: FamilyStore,
    private readonly edits: Edits,
    private readonly members: Members,
  ) {}

  private get state(): State { return this.store.state; }
  private get settings() { return this.store.settings; }

  private lens(actor: Actor, state: State = this.state): Lens {
    const ix = indexOf(state);
    const scope = scopeOf(this.state, indexOf(this.state), actor.anchors);
    const year = thisYear();
    return {
      ix, scope,
      view: (p) => viewOf(state, ix, actor, scope, p, this.settings, year),
      living: (p) => isLiving(state, ix, p, this.settings, year),
      editing: (id) => {
        if (actor.visitor) return this.settings.visitorsCanSuggest ? 'suggest' : 'none';
        return isAdmin(actor) || id === actor.personId || scope.core.has(id) || scope.partners.has(id) ? 'apply' : 'suggest';
      },
    };
  }

  closedTo(actor: Actor): boolean {
    return actor.visitor && this.settings.visibility === 'private';
  }

  /*
   * The family with the additions of pending edits drawn in, so a suggested
   * or drafted person can appear on the tree in pencil for those who may see it.
   */
  private async withPending(actor: Actor): Promise<{ state: State; marks: Map<string, PendingMark> }> {
    const marks = new Map<string, PendingMark>();
    let state = this.state;
    for (const edit of await this.edits.pendingFor(actor)) {
      if (!edit.ops.some((op) => op.type === 'person.create')) continue;
      const additions = edit.ops.filter((op) => ADDITIVE.has(op.type) && (op.type !== 'fact.add' || String(op.subject?.id).startsWith('$')));
      const attempt = cloneState(state);
      let counter = 0;
      try {
        const env = { newId: (prefix: string) => `${prefix}_pending_${edit.id}_${counter++}`, now: edit.createdAt, userId: edit.authorUserId, userName: edit.authorName };
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
  async tree(actor: Actor): Promise<TreeSnapshot> {
    const family = { name: this.settings.familyName, description: this.settings.description, visibility: this.settings.visibility };
    if (this.closedTo(actor)) return { seq: this.store.seq, family, closed: true, people: [], unions: [], rootId: null };

    const { state, marks } = await this.withPending(actor);
    const lens = this.lens(actor, state);
    const shown = new Map<string, string>();   // real id -> id sent to the browser
    const people: TreePerson[] = [];
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

    const sent = (id: string) => shown.get(id) as string;
    const unions: TreeUnion[] = [];
    for (const union of state.unions.values()) {
      if (!present(union)) continue;
      const partners = livingPartners(state, union);
      if (!partners.length) continue;
      const anyMasked = partners.some((id) => shown.get(id) !== id);
      const host = hostOf(state, union);
      unions.push({
        id: union.id, partners: partners.map(sent), host: host ? sent(host) : null,
        since: anyMasked ? null : union.since, status: union.status, kind: union.kind, pending: marks.get(union.id) ?? null,
        children: livingChildren(state, union).map((child) => ({ id: sent(child.id), kind: child.kind })),
      });
    }
    const root = this.settings.rootPersonId;
    const rootId = root && person(state, root) ? sent(root) : people[0]?.id ?? null;
    return { seq: this.store.seq, family, closed: false, people, unions, rootId };
  }

  /* One person in full, for the card. */
  async person(actor: Actor, id: string): Promise<PersonDetail> {
    if (this.closedTo(actor)) throw forbidden('This family tree is private.');
    const lens = this.lens(actor);
    const state = this.state;
    const p = person(state, id);
    if (!p || lens.view(p) === 'masked') throw notFound('That person is not on the tree, or is private.');
    const { ix } = lens;

    const brief = (personId: string): RelativeBrief | null => {
      const other = person(state, personId);
      if (!other) return null;
      if (lens.view(other) === 'masked') return { id: null, name: 'Living relative', masked: true };
      return { id: other.id, name: fullName(other), born: bornYear(ix, other.id), died: diedYear(ix, other.id) };
    };
    const briefs = (ids: string[]) => ids.map(brief).filter((relative): relative is RelativeBrief => relative !== null);
    const facts = factsOf(ix, id).filter((fact) => factVisible(actor, lens.scope, fact, id)).map((fact) => ({
      id: fact.id, type: fact.type, date: fact.date, dateText: formatDate(fact.date), place: fact.place,
      value: fact.value, note: fact.note, certainty: fact.certainty, privacy: fact.privacy,
    }));
    const unions = unionsOf(ix, id).map((union) => ({
      id: union.id, kind: union.kind, status: union.status, since: union.since, host: hostOf(state, union),
      partner: briefs(livingPartners(state, union).filter((other) => other !== id))[0] ?? null,
      children: livingChildren(state, union).flatMap((child) => { const who = brief(child.id); return who ? [{ ...who, kind: child.kind }] : []; }),
    }));
    const born = birthUnions(ix, id)[0] ?? null;
    const siblings = born ? briefs(livingChildren(state, born).filter((child) => child.id !== id).map((child) => child.id)) : [];
    const memories = [...state.memories.values()].filter((m) => present(m) && m.personId === id && !actor.visitor)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({ id: m.id, author: m.authorName, body: m.body, at: m.createdAt, mine: m.authorUserId === actor.userId }));
    const pending = await this.edits.pendingFor(actor);
    const waiting = await this.edits.presentAll(pending.filter((edit) => edit.status === 'suggested' && edit.touched.includes(id)), actor);
    const editing = lens.editing(id);

    return {
      id, given: p.given, family: p.family, birthName: p.birthName, name: fullName(p), sex: p.sex, living: p.living,
      gone: !lens.living(p), privacy: p.privacy, consented: Boolean(p.consentAt), bio: p.bio,
      born: bornYear(ix, id), died: diedYear(ix, id), facts, unions, siblings, memories, waiting,
      parents: briefs(parentsOf(state, ix, id)), parentUnionId: born?.id ?? null,
      isSelf: id === actor.personId, editing,
      canRemove: isAdmin(actor) || (editing === 'apply' && id !== actor.personId && !childrenOf(state, ix, id).length),
    };
  }

  search(actor: Actor, query: unknown): SearchHit[] {
    if (this.closedTo(actor)) return [];
    const lens = this.lens(actor);
    const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const results: SearchHit[] = [];
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
  relationship(actor: Actor, fromId: string, toId: string): Relationship {
    const lens = this.lens(actor);
    const seen = (id: string) => { const p = person(this.state, id); return p && lens.view(p) === 'full' ? p : null; };
    if (this.closedTo(actor) || !seen(fromId) || !seen(toId)) throw notFound('One of those people is not on the tree, or is private.');
    const path = pathBetween(this.state, lens.ix, fromId, toId);
    if (!path) return { connected: false, steps: [] };
    return {
      connected: true,
      steps: path.map((step) => {
        const shown = seen(step.person);
        return { how: step.how, name: shown ? fullName(shown) : 'a living relative', sex: shown?.sex ?? 'unknown' };
      }),
    };
  }

  /*
   * A compact indented outline of someone's descendants, ancestors, or both,
   * with ids. Written for AI clients: it says a lot in few words.
   */
  outline(actor: Actor, rootId: string, direction: 'descendants' | 'ancestors' | 'both', depth: number): string {
    const state = this.state;
    const lens = this.lens(actor);
    const label = (id: string): string => {
      const p = person(state, id);
      if (!p || lens.view(p) === 'masked') return 'Living relative (private)';
      const born = bornYear(lens.ix, id), died = diedYear(lens.ix, id);
      const years = born ? ` (${born}${died ? `–${died}` : ''})` : '';
      return `${fullName(p)}${p.birthName ? ` born ${p.birthName}` : ''}${years} [${id}]`;
    };
    const lines: string[] = [];
    const seen = new Set<string>();
    const walk = (id: string, level: number, step: (id: string) => string[]) => {
      if (level > depth || seen.has(id)) return;
      seen.add(id);
      const partners = partnersOf(state, lens.ix, id);
      lines.push(`${'  '.repeat(level)}${label(id)}${direction !== 'ancestors' && partners.length ? ` + ${partners.map(label).join(' + ')}` : ''}`);
      for (const next of step(id)) walk(next, level + 1, step);
    };
    if (direction !== 'ancestors') walk(rootId, 0, (id) => childrenOf(state, lens.ix, id));
    if (direction !== 'descendants') {
      seen.delete(rootId);
      lines.push(direction === 'both' ? '\nAncestors:' : '');
      walk(rootId, 0, (id) => parentsOf(state, lens.ix, id));
    }
    return lines.filter((line, index) => line || index).join('\n');
  }

  /* Missing or suspicious data, limited to what this person looks after. A to-do list. */
  async health(actor: Actor): Promise<HealthReport> {
    const lens = this.lens(actor);
    const { ix } = lens;
    const state = this.state;
    const mine = (id: string) => isAdmin(actor) || lens.scope.core.has(id) || lens.scope.partners.has(id) || id === actor.personId;
    const people = [...state.people.values()].filter((p) => present(p) && mine(p.id));
    const entry = (p: Person): HealthEntry => ({ id: p.id, name: fullName(p), detail: '' });

    const everyone: Change[] = people.map((p) => ({ kind: 'people', id: p.id, before: p, after: p }));
    const check = validate(state, everyone);
    const report: HealthReport = {
      unnamed: people.filter((p) => !p.given).map(entry),
      noBirthDate: people.filter((p) => p.given && bornYear(ix, p.id) === null).map(entry),
      noParents: people.filter((p) => !parentsOf(state, ix, p.id).length && !partnersOf(state, ix, p.id).length).map(entry),
      suspicious: [...new Map([...check.errors, ...check.warnings].filter((issue) => issue.code !== 'possible_duplicate').map((issue) => [issue.message, issue])).values()],
    };
    if (isAdmin(actor)) {
      const covered = new Set<string>();
      for (const member of await this.members.members()) {
        const scope = scopeOf(state, ix, member.anchors);
        for (const id of [...scope.core, ...scope.partners]) covered.add(id);
      }
      report.withoutSteward = people.filter((p) => !covered.has(p.id)).length;
      report.total = people.length;
    }
    return report;
  }
}
