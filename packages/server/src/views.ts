/*
 * What a given person is allowed to see: the tree, one person, search results,
 * and the health report. Every read goes through the privacy rules here, so
 * the app, the API and AI clients can never see more than their owner.
 */

import {
  ADDITIVE, LANGS, TEXT_FIELDS, applyOps, birthUnions, bornYear, childrenOf, cloneState, factVisible, factsOf, formatDate, fullName, hostOf, indexOf,
  isAdmin, isLiving, issueText, livingChildren, livingPartners, parentsOf, partnersOf, pathBetween, person, present, say, scopeOf, textOf, unionsOf, validate, viewOf, wordsOf, writtenIn, yearOf,
} from '@reactive-family-tree/core';
import type {
  Actor, Change, Fact, FactType, HealthEntry, HealthReport, Lang, PendingMark, Person, PersonDetail, Reach, Relationship, RelativeBrief, Scope, SearchHit, State, TreePerson, TreeSnapshot,
  TreeUnion,
} from '@reactive-family-tree/core';

import type { Edits } from './edits';
import { forbidden, notFound } from './errors';
import type { Members } from './members';
import { familyText } from './settings';
import type { FamilyStore } from './store';

const thisYear = () => new Date().getFullYear();

/* Text made ready for comparing: small letters, and no accents or Hebrew vowel points to trip over. */
const fold = (text: string): string => text.normalize('NFKD').replace(/[\u0300-\u036f\u0591-\u05c7]/g, '').toLowerCase();

/* Everything needed to answer "who can this viewer see, and how much". */
interface Lens {
  ix: ReturnType<typeof indexOf>;
  scope: Scope;
  view(p: Person): 'full' | 'masked';
  living(p: Person): boolean;
  /*
   * The first fact of a kind about someone, if this viewer may see it. A fact
   * can be more private than its person, so the years on a leaf and the words
   * a search looks through come from here and never straight from the record.
   */
  fact(personId: string, type: FactType): Fact | null;
  born(personId: string): number | null;
  died(personId: string): number | null;
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
  /* The language someone reads the tree in: their own, or the family's. */
  langOf(actor: Pick<Actor, 'lang'>): Lang { return actor.lang ?? this.settings.language; }

  private lens(actor: Actor, state: State = this.state): Lens {
    const ix = indexOf(state);
    // Indexing the family is the costly part of a read, so it is done once when the two are the same family
    const scope = scopeOf(this.state, state === this.state ? ix : indexOf(this.state), actor.anchors);
    const year = thisYear();
    const fact = (personId: string, type: FactType) => factsOf(ix, personId).find((known) => known.type === type && factVisible(actor, scope, known, personId)) ?? null;
    return {
      ix, scope, fact,
      born: (personId) => yearOf(fact(personId, 'birth')?.date),
      died: (personId) => yearOf(fact(personId, 'death')?.date),
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
    const lang = this.langOf(actor);
    const family = { name: familyText(this.settings, 'familyName', lang), description: familyText(this.settings, 'description', lang), visibility: this.settings.visibility };
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
        id: p.id, given: textOf(p, 'given', lang), family: textOf(p, 'family', lang), birthName: textOf(p, 'birthName', lang), sex: p.sex,
        born: lens.born(p.id), died: lens.died(p.id),
        gone: !lens.living(p), privacy: p.privacy, portrait: p.portrait, pending, editing: pending ? 'none' : lens.editing(p.id),
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
        // Of a partnership with someone kept private, only that it is there is told. The same goes for how a private child came to the family.
        since: anyMasked ? null : union.since, status: anyMasked ? 'unknown' : union.status, kind: anyMasked ? 'unknown' : union.kind, pending: marks.get(union.id) ?? null,
        children: livingChildren(state, union).map((child) => ({ id: sent(child.id), kind: sent(child.id) === child.id ? child.kind : 'unknown' })),
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
    const lang = this.langOf(actor);

    const brief = (personId: string): RelativeBrief | null => {
      const other = person(state, personId);
      if (!other) return null;
      if (lens.view(other) === 'masked') return { id: null, name: say(lang, 'Living relative'), masked: true };
      return { id: other.id, name: fullName(other, lang), sex: other.sex, born: lens.born(other.id), died: lens.died(other.id) };
    };
    const briefs = (ids: string[]) => ids.map(brief).filter((relative): relative is RelativeBrief => relative !== null);
    const facts = factsOf(ix, id).filter((fact) => factVisible(actor, lens.scope, fact, id)).map((fact) => ({
      id: fact.id, type: fact.type, date: fact.date, dateText: formatDate(fact.date, lang), place: textOf(fact, 'place', lang),
      value: textOf(fact, 'value', lang), note: textOf(fact, 'note', lang), certainty: fact.certainty, privacy: fact.privacy, words: wordsOf(fact, TEXT_FIELDS.facts, lang),
    }));
    const unions = unionsOf(ix, id).map((union) => {
      const partner = briefs(livingPartners(state, union).filter((other) => other !== id))[0] ?? null;
      const host = hostOf(state, union);
      // Of a partner who is kept private nothing is told: not who they are, which their id would give away, nor since when or how it stands
      const kept = partner?.masked === true;
      return {
        id: union.id, kind: kept ? 'unknown' as const : union.kind, status: kept ? 'unknown' as const : union.status, since: kept ? null : union.since,
        host: kept && host !== id ? null : host, partner,
        children: livingChildren(state, union).flatMap((child) => { const who = brief(child.id); return who ? [{ ...who, kind: who.masked ? 'unknown' as const : child.kind }] : []; }),
      };
    });
    const born = birthUnions(ix, id)[0] ?? null;
    const siblings = born ? briefs(livingChildren(state, born).filter((child) => child.id !== id).map((child) => child.id)) : [];
    const editing = lens.editing(id);
    // The people who may tell a memory again in another language: its author, the person it is about, whoever looks after them
    const mayRetell = (m: { authorUserId: string | null }) => !actor.visitor && (isAdmin(actor) || m.authorUserId === actor.userId || id === actor.personId || lens.scope.core.has(id) || lens.scope.partners.has(id));
    const memories = [...state.memories.values()].filter((m) => present(m) && m.personId === id && !actor.visitor)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => ({
        id: m.id, author: m.authorName, body: textOf(m, 'body', lang), at: m.createdAt, mine: m.authorUserId === actor.userId,
        canTranslate: mayRetell(m), words: wordsOf(m, TEXT_FIELDS.memories, lang),
      }));
    const pending = await this.edits.pendingFor(actor);
    const waiting = await this.edits.presentAll(pending.filter((edit) => edit.status === 'suggested' && edit.touched.includes(id)), actor);

    return {
      id, given: textOf(p, 'given', lang), family: textOf(p, 'family', lang), birthName: textOf(p, 'birthName', lang), name: fullName(p, lang), sex: p.sex, living: p.living,
      gone: !lens.living(p), privacy: p.privacy, consented: Boolean(p.consentAt), bio: textOf(p, 'bio', lang), portrait: p.portrait, words: wordsOf(p, TEXT_FIELDS.people, lang),
      born: lens.born(id), died: lens.died(id), facts, unions, siblings, memories, waiting,
      parents: briefs(parentsOf(state, ix, id)), parentUnionId: born?.id ?? null,
      isSelf: id === actor.personId, editing,
      canRemove: isAdmin(actor) || (editing === 'apply' && id !== actor.personId && !childrenOf(state, ix, id).length),
    };
  }

  /* The id of someone's photo, if they have one and this viewer may see them. */
  portraitOf(actor: Actor, id: string): string | null {
    if (this.closedTo(actor)) return null;
    const p = person(this.state, id);
    return p && this.lens(actor).view(p) === 'full' ? p.portrait : null;
  }

  search(actor: Actor, query: unknown): SearchHit[] {
    if (this.closedTo(actor)) return [];
    const lens = this.lens(actor);
    const lang = this.langOf(actor);
    const words = fold(String(query ?? '')).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const results: SearchHit[] = [];
    for (const p of this.state.people.values()) {
      if (!present(p) || lens.view(p) === 'masked') continue;
      // Only what this viewer may see is searched, or a hit would give away what the card hides.
      // A person is found by their name in any language it is written in, whatever language the search is typed in.
      const born = lens.born(p.id), place = lens.fact(p.id, 'birth');
      const every = (thing: Parameters<typeof writtenIn>[0], field: string) => LANGS.map((one) => writtenIn(thing, field, one) ?? '').join(' ');
      const hay = fold(`${every(p, 'given')} ${every(p, 'family')} ${every(p, 'birthName')} ${born ?? ''} ${place ? every(place, 'place') : ''}`);
      if (words.every((word) => hay.includes(word))) {
        results.push({ id: p.id, name: fullName(p, lang), birthName: textOf(p, 'birthName', lang), born, died: lens.died(p.id) });
      }
    }
    return results.slice(0, 25);
  }

  /* How two people are connected, as a chain of relatives. */
  relationship(actor: Actor, fromId: string, toId: string): Relationship {
    const lens = this.lens(actor);
    const seen = (id: string) => { const p = person(this.state, id); return p && lens.view(p) === 'full' ? p : null; };
    if (this.closedTo(actor) || !seen(fromId) || !seen(toId)) throw notFound('One of those people is not on the tree, or is private.');
    const lang = this.langOf(actor);
    const path = pathBetween(this.state, lens.ix, fromId, toId);
    if (!path) return { connected: false, steps: [] };
    return {
      connected: true,
      steps: path.map((step) => {
        const shown = seen(step.person);
        return { how: step.how, name: shown ? fullName(shown, lang) : say(lang, 'a living relative'), sex: shown?.sex ?? 'unknown' };
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
    const lang = this.langOf(actor);
    // Written for an AI, which reads the plain words around the names in any language
    const label = (id: string): string => {
      const p = person(state, id);
      if (!p || lens.view(p) === 'masked') return say(lang, 'Living relative (private)');
      const born = lens.born(id), died = lens.died(id), birthName = textOf(p, 'birthName', lang);
      const years = born ? ` (${born}${died ? `–${died}` : ''})` : '';
      return `${fullName(p, lang)}${birthName ? ` born ${birthName}` : ''}${years} [${id}]`;
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
    const lang = this.langOf(actor);
    const entry = (p: Person): HealthEntry => ({ id: p.id, name: fullName(p, lang), detail: '' });

    const seen = (id: string): boolean => { const other = person(state, id); return !other || lens.view(other) === 'full'; };
    const everyone: Change[] = people.map((p) => ({ kind: 'people', id: p.id, before: p, after: p }));
    const check = validate(state, everyone);
    const report: HealthReport = {
      unnamed: people.filter((p) => !p.given).map(entry),
      noBirthDate: people.filter((p) => p.given && bornYear(ix, p.id) === null).map(entry),
      noParents: people.filter((p) => !parentsOf(state, ix, p.id).length && !partnersOf(state, ix, p.id).length).map(entry),
      // An issue about someone in their care can still name a parent they may not see
      suspicious: [...new Map([...check.errors, ...check.warnings].filter((issue) => issue.code !== 'possible_duplicate' && (issue.people ?? []).every(seen)).map((issue) => [issue.message, issue])).values()]
        .map(({ said, ...issue }) => ({ ...issue, message: issueText({ ...issue, said }, lang, (id) => { const found = person(state, id); return found ? fullName(found, lang) : null; }) })),
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
