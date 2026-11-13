/*
 * The single write path.
 *
 * The app, an AI client and an import all end up in submit(). An edit is a
 * list of operations with an author. It is checked against the shared rules,
 * tried on a copy of the family, and then becomes one of:
 *
 *   applied    published, with the before and after of everything it changed
 *   suggested  waiting for a steward or admin
 *   draft      private to its author (how AI changes arrive by default)
 *
 * and later possibly declined, withdrawn or reverted. Nothing is ever erased
 * from history except by the compost purge.
 */

import { OpError, applyOps, canApply, cloneState, decideEdit, describeOp, formatDate, fullName, indexOf, isAdmin, livingPartners, scopeOf, validate } from '@reactive-family-tree/core';
import type { Actor, Applied, Change, CompostItem, EditComment, EditOrigin, EditView, FuzzyDate, InboxCounts, Issue, NotificationView, Op, OpEnv, State, SubmitMode, SubmitStatus, Union } from '@reactive-family-tree/core';
import { aiConnection, edit, editComment, notification } from '@reactive-family-tree/db';
import type { Database } from '@reactive-family-tree/db';
import { and, asc, count, desc, eq, inArray, isNull } from 'drizzle-orm';

import { badRequest, conflict, forbidden, invalid, notFound } from './errors';
import { newId, now } from './ids';
import type { Members } from './members';
import type { Hub } from './realtime';
import type { FamilyStore } from './store';

const MAX_OPS = 5000;   // room for a GEDCOM import; AI clients get a much lower limit of their own
const COMPOST_DAYS = 30;

export type EditRow = typeof edit.$inferSelect;

export interface SubmitInput {
  ops: unknown;
  message?: unknown;
  note?: unknown;
  mode?: SubmitMode;
  origin?: EditOrigin;
  connectionId?: string | null;
}

export interface SubmitResult {
  status: SubmitStatus;
  edit: EditRow | null;
  warnings: Issue[];
  created: Record<string, string>;
  reasons: string[];
  /* Changes still left in a draft after part of it was applied. */
  remaining: number;
}

interface PublishInput {
  creditTo: Actor;
  ops: Op[];
  message: string;
  note?: string;
  origin: EditOrigin;
  connectionId?: string | null;
  warnings?: Issue[];
  /* Set when an existing suggestion is being approved, otherwise a new edit is written. */
  editId?: string | null;
  reviewedBy?: string | null;
  revertsEditId?: string | null;
}

/* Rewrite "$name" references wherever they appear in an operation. */
function mapRefs<T>(value: T, replace: (ref: string) => string): T {
  if (typeof value === 'string') return (value.startsWith('$') ? replace(value) : value) as T;
  if (Array.isArray(value)) return value.map((item) => mapRefs(item, replace)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, key === 'ref' ? inner : mapRefs(inner, replace)])) as T;
  }
  return value;
}

function refsUsed(op: Op): Set<string> {
  const found = new Set<string>();
  mapRefs(op, (ref) => { found.add(ref); return ref; });
  return found;
}

/* Something on the tree with its fields read by name, for comparing "was" and "is". */
const fieldsOf = (entity: object | undefined) => entity as Record<string, unknown> | undefined;

/* The fields an operation can carry, read loosely: operations are a union and most questions here span all of them. */
type LooseOp = Op & { ref?: string; set?: Record<string, unknown>; was?: Record<string, unknown>; person?: string; union?: string; fact?: string; subject?: { id: string }; consent?: boolean };

export class Edits {
  constructor(
    private readonly db: Database,
    private readonly store: FamilyStore,
    private readonly members: Members,
    private readonly hub: Hub,
  ) {}

  private get state(): State { return this.store.state; }
  private get settings() { return this.store.settings; }

  /* ---------- Submitting ---------- */

  /*
   * mode: 'auto'    apply if the author may, otherwise suggest
   *       'suggest' always send for review, even if the author could apply
   *       'draft'   keep private to the author
   *       'dry'     change nothing, just say what would happen
   */
  submit(actor: Actor, input: SubmitInput): Promise<SubmitResult> {
    return this.store.exclusive(() => this.doSubmit(actor, input));
  }

  private async doSubmit(actor: Actor, { ops, message = '', note = '', mode = 'auto', origin = 'ui', connectionId = null }: SubmitInput): Promise<SubmitResult> {
    await this.store.fresh();
    const list = this.prepare(actor, ops);
    const decision = decideEdit(this.state, actor, list, this.settings);
    const trial = this.tryOut(actor, list);
    const warnings = trial.warnings;

    if (mode === 'dry') {
      const status = ({ apply: 'applied', suggest: 'suggested', deny: 'denied' } as const)[decision.outcome];
      return { status, edit: null, reasons: decision.reasons, warnings, created: {}, remaining: 0 };
    }
    const base = { actor, ops: list, message: String(message).slice(0, 300), note: String(note).slice(0, 2000), origin, connectionId, warnings };
    if (mode === 'draft') return this.keep({ ...base, status: 'draft', touched: this.touchedBy(trial.changes, this.state) });
    if (decision.outcome === 'deny') throw forbidden(decision.reasons[0] ?? 'You cannot make that change.', decision.reasons);
    if (decision.outcome === 'suggest' || mode === 'suggest') {
      const result = await this.keep({ ...base, status: 'suggested', touched: this.touchedBy(trial.changes, this.state) });
      const kept = result.edit as EditRow;
      await this.tell(await this.reviewersOf(kept), 'suggestion', kept.id, `${actor.name} suggested a change: ${kept.message || 'no description'}`);
      return { ...result, reasons: decision.reasons };
    }
    return this.publish({ ...base, creditTo: actor });
  }

  /* Check the shape of what was sent, and set the things only the server may set. */
  private prepare(actor: Actor, ops: unknown): Op[] {
    if (!Array.isArray(ops) || !ops.length) throw badRequest('An edit needs at least one change.');
    if (ops.length > MAX_OPS) throw badRequest(`An edit can hold at most ${MAX_OPS} changes.`);
    return ops.map((op: unknown) => {
      if (!op || typeof op !== 'object' || typeof (op as { type?: unknown }).type !== 'string') throw badRequest('Each change needs a type.');
      const clean = { ...(op as LooseOp) };
      delete clean.consent;
      delete clean.was;
      // Choosing to be public counts as consent only when a person chooses it for themselves
      if (clean.type === 'person.update' && clean.set?.privacy === 'public' && clean.person === actor.personId) clean.consent = true;
      const current = fieldsOf(clean.type === 'person.update' ? this.state.people.get(clean.person)
        : clean.type === 'union.update' ? this.state.unions.get(clean.union)
          : clean.type === 'fact.update' ? this.state.facts.get(clean.fact) : undefined);
      // Remember how things were when the change was written, for reviewers and history
      if (current && clean.set) clean.was = Object.fromEntries(Object.keys(clean.set).map((key) => [key, current[key] ?? null]));
      return clean;
    });
  }

  private env(actor: Pick<Actor, 'userId' | 'name'>): OpEnv {
    return { newId, now: now(), userId: actor.userId, userName: actor.name };
  }

  /* Run the edit on a copy of the family. Throws if it cannot work or would break the family. */
  private tryOut(actor: Pick<Actor, 'userId' | 'name'>, ops: Op[]): Applied & { warnings: Issue[] } {
    const copy = cloneState(this.state);
    const applied = this.applyTo(copy, ops, actor);
    const check = validate(copy, applied.changes);
    const [broken] = check.errors;
    if (broken) throw invalid(broken.message, check.errors);
    return { ...applied, warnings: check.warnings };
  }

  private applyTo(state: State, ops: Op[], actor: Pick<Actor, 'userId' | 'name'>): Applied {
    try {
      return applyOps(state, ops, this.env(actor));
    } catch (error) {
      if (error instanceof OpError) throw invalid(error.message, { code: error.code, change: error.index });
      throw error;
    }
  }

  /* People an edit is about, so history can be shown per person and per branch. `family` is who counts as being on the tree. */
  private touchedBy(changes: Change[], family: State): string[] {
    const ids = new Set<string>();
    const addUnion = (union: Union | undefined) => {
      for (const id of union?.partners ?? []) ids.add(id);
      for (const child of union?.children ?? []) ids.add(child.id);
    };
    for (const change of changes) {
      const entity = change.after ?? change.before;
      if (change.kind === 'people') ids.add(entity.id);
      else if (change.kind === 'unions') addUnion(entity as Union);
      else if (change.kind === 'memories') ids.add((entity as Change<'memories'>['after']).personId);
      else {
        const subject = (entity as Change<'facts'>['after']).subject;
        if (subject.type === 'person') ids.add(subject.id);
        else addUnion(family.unions.get(subject.id));
      }
    }
    return [...ids].filter((id) => family.people.has(id));
  }

  /* Store an edit that is not published: a draft or a suggestion. */
  private async keep({ actor, ops, message, note, origin, connectionId, warnings, status, touched }: {
    actor: Actor; ops: Op[]; message: string; note: string; origin: EditOrigin; connectionId: string | null; warnings: Issue[]; status: 'draft' | 'suggested'; touched: string[];
  }): Promise<SubmitResult> {
    const row: EditRow = {
      id: newId('e'), seq: null, status, authorUserId: actor.userId, authorName: actor.name, authorContact: actor.contact ?? null, origin, connectionId, message, note,
      ops, changes: [], warnings, touched, reviewedBy: null, reviewNote: null, revertsEditId: null, createdAt: now(), appliedAt: null,
    };
    await this.db.insert(edit).values(row);
    this.hub.inbox([actor.userId, ...(await this.reviewersOf(row))]);
    return { status, edit: row, warnings, created: {}, reasons: [], remaining: 0 };
  }

  /*
   * Publish: apply to a copy of the family, write it through in one
   * transaction, give it the next sequence number, and only then let the copy
   * become the family. Always called with the store held exclusively.
   */
  private async publish({ creditTo, ops, message, note = '', origin, connectionId = null, warnings = [], editId = null, reviewedBy = null, revertsEditId = null }: PublishInput): Promise<SubmitResult> {
    const next = cloneState(this.state);
    const applied = this.applyTo(next, ops, creditTo);
    const seq = this.store.seq + 1;
    const id = editId ?? newId('e');
    const at = now();
    const outcome = { seq, ops, changes: applied.changes, warnings, touched: this.touchedBy(applied.changes, next), reviewedBy, appliedAt: at };

    await this.db.transaction(async (tx) => {
      await this.store.persist(tx, applied.changes);
      await this.store.writeSeq(tx, seq);
      if (editId) {
        await tx.update(edit).set({ status: 'applied', ...outcome }).where(eq(edit.id, id));
      } else {
        await tx.insert(edit).values({
          id, status: 'applied', ...outcome, authorUserId: creditTo.userId, authorName: creditTo.name, authorContact: creditTo.contact ?? null,
          origin, connectionId, message, note, reviewNote: null, revertsEditId, createdAt: at,
        });
      }
    });
    this.store.adopt(next, seq);
    this.hub.changed(seq);
    return { status: 'applied', edit: await this.need(id), warnings, created: applied.created, reasons: [], remaining: 0 };
  }

  /* ---------- Reading ---------- */

  async get(id: string): Promise<EditRow | null> {
    const [row] = await this.db.select().from(edit).where(eq(edit.id, id));
    return row ?? null;
  }

  async need(id: string): Promise<EditRow> {
    const row = await this.get(id);
    if (!row) throw notFound('That edit does not exist.');
    return row;
  }

  canReview(actor: Actor, row: EditRow): boolean {
    if (row.status !== 'suggested' || actor.visitor) return false;
    if (isAdmin(actor)) return true;
    if (row.authorUserId === actor.userId || !this.settings.stewardsReview || !actor.anchors.length) return false;
    return canApply(this.state, actor, row.ops, this.settings);
  }

  canSee(actor: Actor, row: EditRow): boolean {
    if (actor.visitor) return false;
    if (row.status === 'draft') return row.authorUserId === actor.userId;
    return isAdmin(actor) || row.authorUserId === actor.userId || this.canReview(actor, row) || row.status === 'applied' || row.status === 'reverted';
  }

  private canRevert(actor: Actor, row: EditRow): boolean {
    if (row.status !== 'applied' || !row.changes.length || actor.visitor) return false;
    return isAdmin(actor) || canApply(this.state, actor, row.ops, this.settings);
  }

  private async reviewersOf(row: EditRow): Promise<string[]> {
    if (row.status !== 'suggested') return [];
    const everyone = await this.members.actors();
    return everyone.filter((actor) => this.canReview(actor, row)).map((actor) => actor.userId as string);
  }

  /* Edits still waiting that this person may see: their own, and those they can review. Newest last. */
  async pendingFor(actor: Actor): Promise<EditRow[]> {
    if (actor.visitor) return [];
    const rows = await this.db.select().from(edit).where(inArray(edit.status, ['suggested', 'draft'])).orderBy(asc(edit.createdAt));
    return rows.filter((row) => this.canSee(actor, row));
  }

  /*
   * which: 'review'    suggestions this person can decide
   *        'mine'      what this person wrote that is not history yet, plus decisions on it
   *        'activity'  published history, limited to what this person looks after
   */
  async list(actor: Actor, which: 'review' | 'mine' | 'activity', { personId = null, limit = 60 }: { personId?: string | null; limit?: number } = {}): Promise<EditRow[]> {
    if (actor.visitor || !actor.userId) return [];
    if (which === 'review') {
      const rows = await this.db.select().from(edit).where(eq(edit.status, 'suggested')).orderBy(desc(edit.createdAt));
      return rows.filter((row) => this.canReview(actor, row));
    }
    if (which === 'mine') {
      return this.db.select().from(edit)
        .where(and(eq(edit.authorUserId, actor.userId), inArray(edit.status, ['draft', 'suggested', 'declined', 'withdrawn'])))
        .orderBy(desc(edit.createdAt)).limit(limit);
    }
    const scope = scopeOf(this.state, indexOf(this.state), actor.anchors);
    const mine = (row: EditRow) => isAdmin(actor) || row.authorUserId === actor.userId || row.touched.some((id) => scope.core.has(id) || scope.partners.has(id) || id === actor.personId);
    const rows = await this.db.select().from(edit).where(inArray(edit.status, ['applied', 'reverted'])).orderBy(desc(edit.seq)).limit(400);
    return rows.filter((row) => (personId ? row.touched.includes(personId) : mine(row))).slice(0, limit);
  }

  async counts(actor: Actor): Promise<InboxCounts> {
    if (actor.visitor || !actor.userId) return { review: 0, drafts: 0, unread: 0 };
    const [review, [drafts], [unread]] = await Promise.all([
      this.list(actor, 'review'),
      this.db.select({ n: count() }).from(edit).where(and(eq(edit.authorUserId, actor.userId), eq(edit.status, 'draft'))),
      this.db.select({ n: count() }).from(notification).where(and(eq(notification.userId, actor.userId), isNull(notification.readAt))),
    ]);
    return { review: review.length, drafts: drafts?.n ?? 0, unread: unread?.n ?? 0 };
  }

  /* An edit as the app and AI clients show it: plain sentences, with before and after. */
  async present(row: EditRow, actor: Actor): Promise<EditView> {
    return (await this.presentAll([row], actor))[0]!;
  }

  async presentAll(rows: EditRow[], actor: Actor): Promise<EditView[]> {
    if (!rows.length) return [];
    const ids = rows.map((row) => row.id);
    const connectionIds = [...new Set(rows.map((row) => row.connectionId).filter((id): id is string => Boolean(id)))];
    const [comments, connections] = await Promise.all([
      this.db.select().from(editComment).where(inArray(editComment.editId, ids)).orderBy(asc(editComment.createdAt)),
      connectionIds.length ? this.db.select({ id: aiConnection.id, name: aiConnection.name }).from(aiConnection).where(inArray(aiConnection.id, connectionIds)) : [],
    ]);
    const clientOf = new Map(connections.map((connection) => [connection.id, connection.name]));
    return rows.map((row) => this.show(row, actor, {
      client: row.connectionId ? clientOf.get(row.connectionId) ?? null : null,
      comments: comments.filter((comment) => comment.editId === row.id).map((comment) => ({ author: comment.authorName, body: comment.body, at: comment.createdAt })),
    }));
  }

  private show(row: EditRow, actor: Actor, { client, comments }: { client: string | null; comments: EditComment[] }): EditView {
    const state = this.state;
    const ops = row.ops as LooseOp[];
    const newNames = new Map<string, string>();
    for (const op of ops) {
      if (op.type === 'person.create' && op.ref) newNames.set(op.ref, [op.set?.given, op.set?.family].filter(Boolean).join(' ') || 'someone new');
    }
    const nameOf = (id: string | undefined): string | null => {
      if (!id) return null;
      if (newNames.has(id)) return newNames.get(id) ?? null;
      const known = state.people.get(id);
      if (known) return fullName(known);
      const fact = state.facts.get(id);
      if (fact) return nameOf(fact.subject.id);
      const union = state.unions.get(id);
      return union ? livingPartners(state, union).map(nameOf).join(' and ') : null;
    };
    const showValue = (value: unknown): string => (value === null || value === undefined ? '' : typeof value === 'object' ? formatDate(value as FuzzyDate) : String(value));
    const currentOf = (op: LooseOp) => fieldsOf((op.person ? state.people.get(op.person) : undefined) ?? (op.union ? state.unions.get(op.union) : undefined) ?? (op.fact ? state.facts.get(op.fact) : undefined));
    const waiting = row.status === 'suggested' || row.status === 'draft';

    const lines = ops.map((op) => {
      const subjectName = nameOf(op.person ?? op.fact ?? op.union ?? op.subject?.id);
      const factType = op.type.startsWith('fact.') ? String(op.set?.type ?? (op.fact ? state.facts.get(op.fact)?.type : '') ?? '') || null : null;
      const fields = Object.entries(op.set ?? {}).filter(([key]) => key !== 'type').map(([field, value]) => {
        const line: EditView['lines'][number]['fields'][number] = { field, to: showValue(value) };
        if (op.was) line.was = showValue(op.was[field]);
        // Something else changed this since the suggestion was written
        if (waiting && op.was && showValue(currentOf(op)?.[field]) !== line.was) line.now = showValue(currentOf(op)?.[field]);
        return line;
      });
      // A fact is easier to recognise by what it is and whose it is
      const text = op.type === 'fact.update' ? `Change the ${factType} of ${subjectName}`
        : op.type === 'fact.remove' ? `Remove the ${factType} of ${subjectName}` : describeOp(op, (id) => nameOf(id));
      return { text, subject: subjectName, factType, fields };
    });

    const mine = Boolean(actor.userId) && row.authorUserId === actor.userId;
    const canReview = this.canReview(actor, row);
    return {
      id: row.id, seq: row.seq, status: row.status, origin: row.origin, client,
      author: row.authorName, byVisitor: !row.authorUserId && Boolean(row.authorContact),
      message: row.message, note: row.note, lines, warnings: row.warnings, touched: row.touched,
      reviewedBy: row.reviewedBy, reviewNote: row.reviewNote, createdAt: row.createdAt, appliedAt: row.appliedAt,
      mine, canReview, canRevert: this.canRevert(actor, row),
      // The raw changes, for the two people who may alter them: the author of a draft and a reviewer
      ops: canReview || (mine && row.status === 'draft') ? row.ops : null,
      comments,
    };
  }

  /* ---------- Deciding ---------- */

  review(actor: Actor, id: string, input: { action?: unknown; note?: unknown; ops?: unknown }): Promise<SubmitResult> {
    return this.store.exclusive(() => this.doReview(actor, id, input));
  }

  private async doReview(actor: Actor, id: string, { action, note = '', ops = null }: { action?: unknown; note?: unknown; ops?: unknown }): Promise<SubmitResult> {
    await this.store.fresh();
    const row = await this.need(id);
    if (!this.canReview(actor, row)) throw forbidden('You cannot decide this suggestion.');
    const author = row.authorUserId ? [row.authorUserId] : [];

    if (action === 'decline') {
      if (!String(note).trim()) throw badRequest('Say briefly why, so the person who suggested it knows.');
      await this.db.update(edit).set({ status: 'declined', reviewedBy: actor.name, reviewNote: String(note).slice(0, 1000) }).where(eq(edit.id, id));
      await this.tell(author, 'declined', id, `${actor.name} declined your suggestion: ${note}`);
      this.hub.inbox([actor.userId, ...author]);
      return { status: 'declined', edit: await this.need(id), warnings: [], created: {}, reasons: [], remaining: 0 };
    }
    if (action !== 'approve') throw badRequest('Approve or decline.');

    // "Edit and approve": the reviewer may adjust the changes first. Both names are recorded.
    const adjusted = ops !== null && ops !== undefined;
    const finalOps = adjusted ? this.prepare(actor, ops) : row.ops;
    if (adjusted && !canApply(this.state, actor, finalOps, this.settings)) throw forbidden('Your adjustments go beyond what you can publish.');
    const credit: Actor = { userId: row.authorUserId, name: row.authorName, contact: row.authorContact, role: null, personId: null, anchors: [], visitor: false };
    const trial = this.tryOut(credit, finalOps);
    await this.db.update(edit).set({ reviewNote: adjusted ? `Adjusted by ${actor.name}` : String(note).slice(0, 1000) }).where(eq(edit.id, id));
    const result = await this.publish({ creditTo: credit, ops: finalOps, message: row.message, origin: row.origin, warnings: trial.warnings, editId: id, reviewedBy: actor.name });
    await this.tell(author, 'approved', id, `${actor.name} approved your suggestion: ${row.message || 'no description'}`);
    this.hub.inbox([actor.userId, ...author]);
    return result;
  }

  async withdraw(actor: Actor, id: string): Promise<{ status: 'withdrawn' }> {
    const row = await this.need(id);
    if (row.status !== 'suggested' || !actor.userId || row.authorUserId !== actor.userId) throw forbidden('Only the person who made a suggestion can withdraw it, while it is waiting.');
    const reviewers = await this.reviewersOf(row);
    await this.db.update(edit).set({ status: 'withdrawn' }).where(eq(edit.id, id));
    this.hub.inbox([actor.userId, ...reviewers]);
    return { status: 'withdrawn' };
  }

  async comment(actor: Actor, id: string, body: unknown): Promise<void> {
    const row = await this.need(id);
    if (row.status !== 'suggested' || !(row.authorUserId === actor.userId || this.canReview(actor, row))) throw forbidden('Only the author and reviewers can discuss a suggestion.');
    const words = String(body ?? '').trim();
    if (!words) throw badRequest('Write something first.');
    await this.db.insert(editComment).values({ id: newId('c'), editId: id, authorName: actor.name, body: words.slice(0, 1000), createdAt: now() });
    const others = [row.authorUserId, ...(await this.reviewersOf(row))].filter((userId) => userId && userId !== actor.userId);
    await this.tell(others, 'comment', id, `${actor.name} wrote about a suggestion: ${words.slice(0, 120)}`);
  }

  /* ---------- Drafts ---------- */

  private async ownDraft(actor: Actor, id: string): Promise<EditRow> {
    const row = await this.need(id);
    if (row.status !== 'draft' || !actor.userId || row.authorUserId !== actor.userId) throw forbidden('That is not one of your drafts.');
    return row;
  }

  async discardDraft(actor: Actor, id: string): Promise<void> {
    await this.ownDraft(actor, id);
    await this.db.delete(edit).where(eq(edit.id, id));
    this.hub.inbox([actor.userId]);
  }

  /*
   * Apply a whole draft, or part of it. Choosing a change brings along whatever
   * it depends on. What is left stays in the draft.
   */
  applyDraft(actor: Actor, id: string, indexes: number[] | null = null): Promise<SubmitResult> {
    return this.store.exclusive(async () => {
      await this.store.fresh();
      const draft = await this.ownDraft(actor, id);
      const chosen = new Set(indexes ?? draft.ops.keys());
      const creatorOf = new Map(draft.ops.flatMap((op, index) => ('ref' in op && op.ref ? [[op.ref, index] as const] : [])));
      const pull = (test: (op: Op) => boolean) => {
        for (let grew = true; grew;) {
          grew = false;
          draft.ops.forEach((op, index) => {
            if (!chosen.has(index) && test(op)) { chosen.add(index); grew = true; }
          });
        }
      };
      // what the chosen changes need
      pull((op) => 'ref' in op && Boolean(op.ref) && [...chosen].some((index) => refsUsed(draft.ops[index]!).has(op.ref as string)));
      const pick = () => draft.ops.filter((_, index) => chosen.has(index));
      // if the chosen part will wait for review, nothing that builds on it can stay behind
      if (decideEdit(this.state, actor, pick(), this.settings).outcome !== 'apply') {
        pull((op) => [...refsUsed(op)].some((ref) => chosen.has(creatorOf.get(ref) ?? -1)));
      }

      const result = await this.doSubmit(actor, { ops: pick(), message: draft.message, origin: draft.origin, connectionId: draft.connectionId });
      const rest = draft.ops.filter((_, index) => !chosen.has(index)).map((op) => mapRefs(op, (ref) => result.created[ref] ?? ref));
      if (rest.length) await this.db.update(edit).set({ ops: rest }).where(eq(edit.id, id));
      else await this.db.delete(edit).where(eq(edit.id, id));
      this.hub.inbox([actor.userId]);
      return { ...result, remaining: rest.length };
    });
  }

  /* ---------- Undo ---------- */

  /* Undo is a new edit that puts everything the old one changed back as it was. */
  revert(actor: Actor, id: string): Promise<SubmitResult> {
    return this.store.exclusive(async () => {
      await this.store.fresh();
      const row = await this.need(id);
      if (!this.canRevert(actor, row)) throw forbidden('You cannot undo that edit.');
      const stale = row.changes.filter((change) => (this.state[change.kind].get(change.id)?.rev ?? null) !== change.after.rev);
      if (stale.length) {
        throw conflict('Something this edit changed has been changed again since. Undo the later change first.', stale.map((change) => change.id));
      }
      const ops: Op[] = [...row.changes].reverse().map((change) => ({ type: 'entity.set', kind: change.kind, id: change.id, snapshot: change.before }));
      const result = await this.publish({ creditTo: actor, ops, message: `Undo: ${row.message || 'an edit'}`, origin: 'ui', revertsEditId: id });
      await this.db.update(edit).set({ status: 'reverted' }).where(eq(edit.id, id));
      return result;
    });
  }

  /* ---------- Compost ---------- */

  compost(): CompostItem[] {
    return [...this.state.people.values()]
      .flatMap((p) => (p.deletedAt ? [{ id: p.id, name: fullName(p), removedAt: p.deletedAt }] : []))
      .sort((a, b) => b.removedAt.localeCompare(a.removedAt));
  }

  /* Remove a composted person for good, with everything that only belonged to them. */
  purge(actor: Actor, personId: string): Promise<void> {
    return this.store.exclusive(async () => {
      await this.store.fresh();
      await this.doPurge(actor, personId);
    });
  }

  private async doPurge(actor: Actor, personId: string): Promise<void> {
    const target = this.state.people.get(personId);
    if (!target?.deletedAt) throw badRequest('Only someone in the compost can be removed for good.');
    const next = cloneState(this.state);
    const gone: [Change['kind'], string][] = [];
    for (const fact of next.facts.values()) if (fact.subject.id === personId) gone.push(['facts', fact.id]);
    for (const memory of next.memories.values()) if (memory.personId === personId) gone.push(['memories', memory.id]);
    const cleaned: Pick<Change<'unions'>, 'kind' | 'id' | 'after'>[] = [];
    for (const union of next.unions.values()) {
      if (!union.partners.includes(personId) && !union.children.some((child) => child.id === personId)) continue;
      const partners = union.partners.filter((partner) => partner !== personId);
      const after: Union = { ...union, partners, children: union.children.filter((child) => child.id !== personId), host: union.host && partners.includes(union.host) ? union.host : partners[0] ?? null };
      if (!partners.length) after.deletedAt = now();
      next.unions.set(union.id, after);
      cleaned.push({ kind: 'unions', id: union.id, after });
    }
    for (const [kind, id] of gone) next[kind].delete(id);
    next.people.delete(personId);

    const seq = this.store.seq + 1;
    const at = now();
    await this.db.transaction(async (tx) => {
      for (const [kind, id] of gone) await this.store.erase(tx, kind, id);
      await this.store.persist(tx, cleaned);
      await this.store.erase(tx, 'people', personId);
      await this.store.writeSeq(tx, seq);
      await tx.insert(edit).values({
        id: newId('e'), seq, status: 'applied', authorUserId: actor.userId, authorName: actor.name, authorContact: null, origin: 'system', connectionId: null,
        message: `Removed ${fullName(target)} for good`, note: '', ops: [], changes: [], warnings: [], touched: [], reviewedBy: null, reviewNote: null, revertsEditId: null, createdAt: at, appliedAt: at,
      });
    });
    this.store.adopt(next, seq);
    this.hub.changed(seq);
  }

  /* Run daily: whatever has been in the compost for 30 days goes for good. Returns how many went. */
  sweepCompost(): Promise<number> {
    return this.store.exclusive(async () => {
      await this.store.fresh();
      const cutoff = new Date(Date.now() - COMPOST_DAYS * 86400000).toISOString();
      const system = this.members.system('The compost');
      const due = [...this.state.people.values()].filter((p) => p.deletedAt && p.deletedAt < cutoff);
      for (const p of due) await this.doPurge(system, p.id);
      return due.length;
    });
  }

  /* ---------- Notifications ---------- */

  private async tell(userIds: (string | null | undefined)[], kind: string, editId: string, body: string): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (!ids.length) return;
    await this.db.insert(notification).values(ids.map((userId) => ({ id: newId('n'), userId, kind, editId, body: body.slice(0, 300), createdAt: now(), readAt: null })));
    this.hub.inbox(ids);
  }

  async notifications(actor: Actor): Promise<NotificationView[]> {
    if (!actor.userId) return [];
    const rows = await this.db.select().from(notification).where(eq(notification.userId, actor.userId)).orderBy(desc(notification.createdAt)).limit(40);
    return rows.map((row) => ({ id: row.id, kind: row.kind, editId: row.editId, body: row.body, at: row.createdAt, readAt: row.readAt }));
  }

  async markRead(actor: Actor): Promise<void> {
    if (!actor.userId) return;
    await this.db.update(notification).set({ readAt: now() }).where(and(eq(notification.userId, actor.userId), isNull(notification.readAt)));
  }
}
