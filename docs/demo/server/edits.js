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

import { formatDate } from '../core/dates.js';
import { cloneState, fullName, indexOf, livingPartners, scopeOf } from '../core/graph.js';
import { OpError, applyOps, describeOp } from '../core/ops.js';
import { canApply, decideEdit } from '../core/permissions.js';
import { isAdmin } from '../core/privacy.js';
import { validate } from '../core/validate.js';
import { all, newId, now, one, run, transaction } from './db.js';
import { badRequest, conflict, forbidden, invalid, notFound } from './errors.js';

const MAX_OPS = 5000;   // room for a GEDCOM import; AI clients get a much lower limit of their own
const COMPOST_DAYS = 30;

const fromRow = (row) => row && {
  id: row.id, seq: row.seq, status: row.status,
  authorUserId: row.author_user_id, authorName: row.author_name, contact: JSON.parse(row.author_contact ?? 'null'),
  origin: row.origin, connectionId: row.connection_id, message: row.message, note: row.note,
  ops: JSON.parse(row.ops), changes: JSON.parse(row.changes), warnings: JSON.parse(row.warnings), touched: JSON.parse(row.touched),
  reviewedBy: row.reviewed_by, reviewNote: row.review_note, revertsEditId: row.reverts_edit_id,
  createdAt: row.created_at, appliedAt: row.applied_at,
};

/* Rewrite "$name" references wherever they appear in an operation. */
function mapRefs(value, replace) {
  if (typeof value === 'string') return value.startsWith('$') ? replace(value) : value;
  if (Array.isArray(value)) return value.map((item) => mapRefs(item, replace));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, k === 'ref' ? v : mapRefs(v, replace)]));
  return value;
}

function refsUsed(op) {
  const found = new Set();
  mapRefs(op, (ref) => { found.add(ref); return ref; });
  return found;
}

export class Edits {
  constructor(db, store, auth, hub) {
    this.db = db;
    this.store = store;
    this.auth = auth;
    this.hub = hub;
  }

  get state() { return this.store.state; }
  get settings() { return this.store.settings; }

  /* ---------- Submitting ---------- */

  /*
   * mode: 'auto'    apply if the author may, otherwise suggest
   *       'suggest' always send for review, even if the author could apply
   *       'draft'   keep private to the author
   *       'dry'     change nothing, just say what would happen
   */
  submit(actor, { ops, message = '', note = '', mode = 'auto', origin = 'ui', connectionId = null }) {
    const list = this.prepare(actor, ops);
    const decision = decideEdit(this.state, actor, list, this.settings);
    const trial = this.tryOut(actor, list);
    const warnings = trial.warnings;

    if (mode === 'dry') {
      const status = { apply: 'applied', suggest: 'suggested', deny: 'denied' }[decision.outcome];
      return { status, reasons: decision.reasons, warnings };
    }
    const base = { actor, ops: list, message: String(message).slice(0, 300), note: String(note).slice(0, 2000), origin, connectionId, warnings };
    if (mode === 'draft') return this.keep({ ...base, status: 'draft', touched: this.touchedBy(trial.changes) });
    if (decision.outcome === 'deny') throw forbidden(decision.reasons[0] ?? 'You cannot make that change.', decision.reasons);
    if (decision.outcome === 'suggest' || mode === 'suggest') {
      const result = this.keep({ ...base, status: 'suggested', touched: this.touchedBy(trial.changes) });
      this.tell(this.reviewersOf(result.edit), 'suggestion', result.edit.id, `${actor.name} suggested a change: ${result.edit.message || 'no description'}`);
      return { ...result, reasons: decision.reasons };
    }
    return this.publish({ ...base, creditTo: actor });
  }

  /* Check the shape of what was sent, and set the things only the server may set. */
  prepare(actor, ops) {
    if (!Array.isArray(ops) || !ops.length) throw badRequest('An edit needs at least one change.');
    if (ops.length > MAX_OPS) throw badRequest(`An edit can hold at most ${MAX_OPS} changes.`);
    return ops.map((op) => {
      if (!op || typeof op !== 'object' || typeof op.type !== 'string') throw badRequest('Each change needs a type.');
      const clean = { ...op };
      delete clean.consent;
      delete clean.was;
      // Choosing to be public counts as consent only when a person chooses it for themselves
      if (clean.type === 'person.update' && clean.set?.privacy === 'public' && clean.person === actor.personId) clean.consent = true;
      const current = clean.type === 'person.update' ? this.state.people.get(clean.person)
        : clean.type === 'union.update' ? this.state.unions.get(clean.union)
        : clean.type === 'fact.update' ? this.state.facts.get(clean.fact) : null;
      // Remember how things were when the change was written, for reviewers and history
      if (current && clean.set) clean.was = Object.fromEntries(Object.keys(clean.set).map((key) => [key, current[key] ?? null]));
      return clean;
    });
  }

  env(actor) {
    return { newId, now: now(), userId: actor.userId, userName: actor.name };
  }

  /* Run the edit on a copy of the family. Throws if it cannot work or would break the family. */
  tryOut(actor, ops) {
    const copy = cloneState(this.state);
    let applied;
    try {
      applied = applyOps(copy, ops, this.env(actor));
    } catch (error) {
      if (error instanceof OpError) throw invalid(error.message, { code: error.code, change: error.index });
      throw error;
    }
    const check = validate(copy, applied.changes);
    if (check.errors.length) throw invalid(check.errors[0].message, check.errors);
    return { ...applied, warnings: check.warnings };
  }

  /* People an edit is about, so history can be shown per person and per branch. */
  touchedBy(changes) {
    const ids = new Set();
    const addUnion = (union) => {
      for (const id of union?.partners ?? []) ids.add(id);
      for (const child of union?.children ?? []) ids.add(child.id);
    };
    for (const change of changes) {
      const entity = change.after ?? change.before;
      if (change.kind === 'people') ids.add(entity.id);
      if (change.kind === 'unions') addUnion(entity);
      if (change.kind === 'memories') ids.add(entity.personId);
      if (change.kind === 'facts') {
        if (entity.subject.type === 'person') ids.add(entity.subject.id);
        else addUnion(this.state.unions.get(entity.subject.id));
      }
    }
    return [...ids].filter((id) => this.state.people.has(id));
  }

  /* Store an edit that is not published: a draft or a suggestion. */
  keep({ actor, ops, message, note, origin, connectionId, warnings, status, touched }) {
    const id = newId('e');
    run(this.db, `INSERT INTO edit (id, status, author_user_id, author_name, author_contact, origin, connection_id, message, note, ops, changes, warnings, touched, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]', ?, ?, ?)`,
    id, status, actor.userId, actor.name, JSON.stringify(actor.contact ?? null), origin, connectionId, message, note,
    JSON.stringify(ops), JSON.stringify(warnings), JSON.stringify(touched), now());
    const edit = this.get(id);
    this.hub.inbox([actor.userId, ...this.reviewersOf(edit)]);
    return { status, edit, warnings, created: {} };
  }

  /*
   * Publish: apply to the real family, write it through, give it the next
   * sequence number. `editId` is set when an existing suggestion is being
   * approved, otherwise a new edit is written.
   */
  publish({ creditTo, ops, message, note = '', origin, connectionId = null, warnings = [], editId = null, reviewedBy = null, revertsEditId = null }) {
    let result;
    try {
      result = transaction(this.db, () => {
        const applied = applyOps(this.state, ops, this.env(creditTo));
        this.store.persist(applied.changes);
        const seq = this.store.nextSeq();
        const id = editId ?? newId('e');
        const fields = [seq, JSON.stringify(ops), JSON.stringify(applied.changes), JSON.stringify(warnings), JSON.stringify(this.touchedBy(applied.changes)), reviewedBy, now()];
        if (editId) {
          run(this.db, "UPDATE edit SET status = 'applied', seq = ?, ops = ?, changes = ?, warnings = ?, touched = ?, reviewed_by = ?, applied_at = ? WHERE id = ?", ...fields, id);
        } else {
          run(this.db, `INSERT INTO edit (seq, ops, changes, warnings, touched, reviewed_by, applied_at, id, status, author_user_id, author_name, author_contact, origin, connection_id, message, note, reverts_edit_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          ...fields, id, creditTo.userId, creditTo.name, JSON.stringify(creditTo.contact ?? null), origin, connectionId, message, note, revertsEditId, now());
        }
        return { id, created: applied.created };
      });
    } catch (error) {
      // Memory may be ahead of the database after a failed write. Read the truth back.
      this.store.load();
      if (error instanceof OpError) throw invalid(error.message, { code: error.code, change: error.index });
      throw error;
    }
    this.hub.changed(this.store.seq);
    return { status: 'applied', edit: this.get(result.id), warnings, created: result.created };
  }

  /* ---------- Reading ---------- */

  get(id) {
    return fromRow(one(this.db, 'SELECT * FROM edit WHERE id = ?', id));
  }

  need(id) {
    const edit = this.get(id);
    if (!edit) throw notFound('That edit does not exist.');
    return edit;
  }

  canReview(actor, edit) {
    if (edit.status !== 'suggested' || actor.visitor) return false;
    if (isAdmin(actor)) return true;
    if (edit.authorUserId === actor.userId || !this.settings.stewardsReview || !actor.anchors.length) return false;
    return canApply(this.state, actor, edit.ops, this.settings);
  }

  canSee(actor, edit) {
    if (actor.visitor) return false;
    if (edit.status === 'draft') return edit.authorUserId === actor.userId;
    return isAdmin(actor) || edit.authorUserId === actor.userId || this.canReview(actor, edit) || edit.status === 'applied' || edit.status === 'reverted';
  }

  canRevert(actor, edit) {
    if (edit.status !== 'applied' || !edit.changes.length || actor.visitor) return false;
    return isAdmin(actor) || canApply(this.state, actor, edit.ops, this.settings);
  }

  reviewersOf(edit) {
    if (edit.status !== 'suggested') return [];
    return all(this.db, 'SELECT * FROM user').filter((user) => this.canReview(this.auth.actorFor(user), edit)).map((user) => user.id);
  }

  /* Edits still waiting that this person may see: their own, and those they can review. Newest last. */
  pendingFor(actor) {
    if (actor.visitor) return [];
    return all(this.db, "SELECT * FROM edit WHERE status IN ('suggested', 'draft') ORDER BY created_at").map(fromRow).filter((edit) => this.canSee(actor, edit));
  }

  /*
   * which: 'review'    suggestions this person can decide
   *        'mine'      what this person wrote that is not history yet, plus decisions on it
   *        'activity'  published history, limited to what this person looks after
   */
  list(actor, which, { personId = null, limit = 60 } = {}) {
    if (actor.visitor) return [];
    if (which === 'review') {
      return all(this.db, "SELECT * FROM edit WHERE status = 'suggested' ORDER BY created_at DESC").map(fromRow).filter((edit) => this.canReview(actor, edit));
    }
    if (which === 'mine') {
      return all(this.db, "SELECT * FROM edit WHERE author_user_id = ? AND status IN ('draft', 'suggested', 'declined', 'withdrawn') ORDER BY created_at DESC LIMIT ?", actor.userId, limit).map(fromRow);
    }
    const scope = scopeOf(this.state, indexOf(this.state), actor.anchors);
    const mine = (edit) => isAdmin(actor) || edit.authorUserId === actor.userId || edit.touched.some((id) => scope.core.has(id) || scope.partners.has(id) || id === actor.personId);
    return all(this.db, "SELECT * FROM edit WHERE status IN ('applied', 'reverted') ORDER BY seq DESC LIMIT 400").map(fromRow)
      .filter((edit) => (personId ? edit.touched.includes(personId) : mine(edit)))
      .slice(0, limit);
  }

  counts(actor) {
    if (actor.visitor) return { review: 0, drafts: 0, unread: 0 };
    return {
      review: this.list(actor, 'review').length,
      drafts: one(this.db, "SELECT COUNT(*) AS n FROM edit WHERE author_user_id = ? AND status = 'draft'", actor.userId).n,
      unread: one(this.db, 'SELECT COUNT(*) AS n FROM notification WHERE user_id = ? AND read_at IS NULL', actor.userId).n,
    };
  }

  /* An edit as the app and AI clients show it: plain sentences, with before and after. */
  present(edit, actor) {
    const state = this.state;
    const newNames = new Map();
    for (const op of edit.ops) {
      if (op.type === 'person.create' && op.ref) newNames.set(op.ref, [op.set?.given, op.set?.family].filter(Boolean).join(' ') || 'someone new');
    }
    const nameOf = (id) => {
      if (newNames.has(id)) return newNames.get(id);
      if (state.people.has(id)) return fullName(state.people.get(id));
      const fact = state.facts.get(id);
      if (fact) return nameOf(fact.subject.id);
      const union = state.unions.get(id);
      return union ? livingPartners(state, union).map(nameOf).join(' and ') : null;
    };
    const show = (value) => (value === null || value === undefined ? '' : typeof value === 'object' ? formatDate(value) : String(value));
    const currentOf = (op) => state.people.get(op.person) ?? state.unions.get(op.union) ?? state.facts.get(op.fact);
    const waiting = edit.status === 'suggested' || edit.status === 'draft';

    const lines = edit.ops.map((op) => {
      const subjectName = nameOf(op.person ?? op.fact ?? op.union ?? op.subject?.id);
      const factType = op.type.startsWith('fact.') ? (op.set?.type ?? state.facts.get(op.fact)?.type) : null;
      const fields = Object.entries(op.set ?? {}).filter(([key]) => key !== 'type').map(([field, value]) => {
        const row = { field, to: show(value) };
        if (op.was) row.was = show(op.was[field]);
        // Something else changed this since the suggestion was written
        if (waiting && op.was && show(currentOf(op)?.[field]) !== row.was) row.now = show(currentOf(op)?.[field]);
        return row;
      });
      // A fact is easier to recognise by what it is and whose it is
      const text = op.type === 'fact.update' ? `Change the ${factType} of ${subjectName}`
        : op.type === 'fact.remove' ? `Remove the ${factType} of ${subjectName}` : describeOp(op, nameOf);
      return { text, subject: subjectName, factType, fields };
    });

    const connection = edit.connectionId ? one(this.db, 'SELECT name FROM connection WHERE id = ?', edit.connectionId) : null;
    const mine = Boolean(actor.userId) && edit.authorUserId === actor.userId;
    const canReview = this.canReview(actor, edit);
    return {
      id: edit.id, seq: edit.seq, status: edit.status, origin: edit.origin, client: connection?.name ?? null,
      author: edit.authorName, byVisitor: !edit.authorUserId && Boolean(edit.contact),
      message: edit.message, note: edit.note, lines, warnings: edit.warnings, touched: edit.touched,
      reviewedBy: edit.reviewedBy, reviewNote: edit.reviewNote, createdAt: edit.createdAt, appliedAt: edit.appliedAt,
      mine, canReview, canRevert: this.canRevert(actor, edit),
      // The raw changes, for the two people who may alter them: the author of a draft and a reviewer
      ops: canReview || (mine && edit.status === 'draft') ? edit.ops : null,
      comments: all(this.db, 'SELECT author_name AS author, body, created_at AS at FROM edit_comment WHERE edit_id = ? ORDER BY created_at', edit.id),
    };
  }

  /* ---------- Deciding ---------- */

  review(actor, id, { action, note = '', ops = null }) {
    const edit = this.need(id);
    if (!this.canReview(actor, edit)) throw forbidden('You cannot decide this suggestion.');
    const author = edit.authorUserId ? [edit.authorUserId] : [];

    if (action === 'decline') {
      if (!String(note).trim()) throw badRequest('Say briefly why, so the person who suggested it knows.');
      run(this.db, "UPDATE edit SET status = 'declined', reviewed_by = ?, review_note = ? WHERE id = ?", actor.name, String(note).slice(0, 1000), id);
      this.tell(author, 'declined', id, `${actor.name} declined your suggestion: ${note}`);
      this.hub.inbox([actor.userId, ...author]);
      return { status: 'declined', edit: this.get(id) };
    }
    if (action !== 'approve') throw badRequest('Approve or decline.');

    // "Edit and approve": the reviewer may adjust the changes first. Both names are recorded.
    const adjusted = ops !== null;
    const finalOps = adjusted ? this.prepare(actor, ops) : edit.ops;
    if (adjusted && !canApply(this.state, actor, finalOps, this.settings)) throw forbidden('Your adjustments go beyond what you can publish.');
    const credit = { userId: edit.authorUserId, name: edit.authorName, contact: edit.contact };
    const trial = this.tryOut(credit, finalOps);
    run(this.db, 'UPDATE edit SET review_note = ? WHERE id = ?', adjusted ? `Adjusted by ${actor.name}` : String(note).slice(0, 1000), id);
    const result = this.publish({ creditTo: credit, ops: finalOps, warnings: trial.warnings, editId: id, reviewedBy: actor.name });
    this.tell(author, 'approved', id, `${actor.name} approved your suggestion: ${edit.message || 'no description'}`);
    this.hub.inbox([actor.userId, ...author]);
    return result;
  }

  withdraw(actor, id) {
    const edit = this.need(id);
    if (edit.status !== 'suggested' || !actor.userId || edit.authorUserId !== actor.userId) throw forbidden('Only the person who made a suggestion can withdraw it, while it is waiting.');
    const reviewers = this.reviewersOf(edit);
    run(this.db, "UPDATE edit SET status = 'withdrawn' WHERE id = ?", id);
    this.hub.inbox([actor.userId, ...reviewers]);
    return { status: 'withdrawn' };
  }

  comment(actor, id, body) {
    const edit = this.need(id);
    if (edit.status !== 'suggested' || !(edit.authorUserId === actor.userId || this.canReview(actor, edit))) throw forbidden('Only the author and reviewers can discuss a suggestion.');
    if (!String(body ?? '').trim()) throw badRequest('Write something first.');
    run(this.db, 'INSERT INTO edit_comment (id, edit_id, author_name, body, created_at) VALUES (?, ?, ?, ?, ?)', newId('c'), id, actor.name, String(body).trim().slice(0, 1000), now());
    const others = [edit.authorUserId, ...this.reviewersOf(edit)].filter((userId) => userId && userId !== actor.userId);
    this.tell(others, 'comment', id, `${actor.name} wrote about a suggestion: ${String(body).trim().slice(0, 120)}`);
  }

  /* ---------- Drafts ---------- */

  ownDraft(actor, id) {
    const edit = this.need(id);
    if (edit.status !== 'draft' || !actor.userId || edit.authorUserId !== actor.userId) throw forbidden('That is not one of your drafts.');
    return edit;
  }

  discardDraft(actor, id) {
    this.ownDraft(actor, id);
    run(this.db, 'DELETE FROM edit WHERE id = ?', id);
    this.hub.inbox([actor.userId]);
  }

  /*
   * Apply a whole draft, or part of it. Choosing a change brings along whatever
   * it depends on. What is left stays in the draft.
   */
  applyDraft(actor, id, indexes = null) {
    const draft = this.ownDraft(actor, id);
    const chosen = new Set(indexes ?? draft.ops.keys());
    const creatorOf = new Map(draft.ops.flatMap((op, index) => (op.ref ? [[op.ref, index]] : [])));
    const pull = (test) => {
      for (let grew = true; grew;) {
        grew = false;
        draft.ops.forEach((op, index) => {
          if (!chosen.has(index) && test(op, index)) { chosen.add(index); grew = true; }
        });
      }
    };
    // what the chosen changes need
    pull((op) => op.ref && [...chosen].some((index) => refsUsed(draft.ops[index]).has(op.ref)));
    const pick = () => draft.ops.filter((_, index) => chosen.has(index));
    // if the chosen part will wait for review, nothing that builds on it can stay behind
    if (decideEdit(this.state, actor, pick(), this.settings).outcome !== 'apply') {
      pull((op) => [...refsUsed(op)].some((ref) => chosen.has(creatorOf.get(ref))));
    }

    const result = this.submit(actor, { ops: pick(), message: draft.message, origin: draft.origin, connectionId: draft.connectionId });
    const rest = draft.ops.filter((_, index) => !chosen.has(index)).map((op) => mapRefs(op, (ref) => result.created[ref] ?? ref));
    if (rest.length) run(this.db, 'UPDATE edit SET ops = ? WHERE id = ?', JSON.stringify(rest), id);
    else run(this.db, 'DELETE FROM edit WHERE id = ?', id);
    this.hub.inbox([actor.userId]);
    return { ...result, remaining: rest.length };
  }

  /* ---------- Undo ---------- */

  /* Undo is a new edit that puts everything the old one changed back as it was. */
  revert(actor, id) {
    const edit = this.need(id);
    if (!this.canRevert(actor, edit)) throw forbidden('You cannot undo that edit.');
    const stale = edit.changes.filter((change) => (this.state[change.kind].get(change.id)?.rev ?? null) !== change.after.rev);
    if (stale.length) {
      throw conflict('Something this edit changed has been changed again since. Undo the later change first.', stale.map((change) => change.id));
    }
    const ops = [...edit.changes].reverse().map((change) => ({ type: 'entity.set', kind: change.kind, id: change.id, snapshot: change.before }));
    const result = this.publish({ creditTo: actor, ops, message: `Undo: ${edit.message || 'an edit'}`, origin: 'ui', revertsEditId: id });
    run(this.db, "UPDATE edit SET status = 'reverted' WHERE id = ?", id);
    return result;
  }

  /* ---------- Compost ---------- */

  compost() {
    return [...this.state.people.values()].filter((p) => p.deletedAt)
      .map((p) => ({ id: p.id, name: fullName(p), removedAt: p.deletedAt }))
      .sort((a, b) => b.removedAt.localeCompare(a.removedAt));
  }

  /* Remove a composted person for good, with everything that only belonged to them. */
  purge(actor, personId) {
    const target = this.state.people.get(personId);
    if (!target?.deletedAt) throw badRequest('Only someone in the compost can be removed for good.');
    transaction(this.db, () => {
      for (const kind of ['facts', 'memories']) {
        for (const item of [...this.state[kind].values()]) {
          if ((item.subject?.id ?? item.personId) === personId) this.store.erase(kind, item.id);
        }
      }
      const cleaned = [];
      for (const union of this.state.unions.values()) {
        if (!union.partners.includes(personId) && !union.children.some((child) => child.id === personId)) continue;
        const partners = union.partners.filter((partner) => partner !== personId);
        const after = { ...union, partners, children: union.children.filter((child) => child.id !== personId), host: partners.includes(union.host) ? union.host : partners[0] ?? null };
        if (!partners.length) after.deletedAt = now();
        this.state.unions.set(union.id, after);
        cleaned.push({ kind: 'unions', id: union.id, after });
      }
      this.store.persist(cleaned);
      this.store.erase('people', personId);
      const seq = this.store.nextSeq();
      run(this.db, `INSERT INTO edit (id, seq, status, author_user_id, author_name, origin, message, note, ops, changes, warnings, touched, created_at, applied_at)
        VALUES (?, ?, 'applied', ?, ?, 'system', ?, '', '[]', '[]', '[]', '[]', ?, ?)`,
      newId('e'), seq, actor.userId, actor.name, `Removed ${fullName(target)} for good`, now(), now());
    });
    this.hub.changed(this.store.seq);
  }

  /* Run daily: whatever has been in the compost for 30 days goes for good. */
  sweepCompost() {
    const cutoff = new Date(Date.now() - COMPOST_DAYS * 86400000).toISOString();
    const system = this.auth.system('The compost');
    for (const p of [...this.state.people.values()]) {
      if (p.deletedAt && p.deletedAt < cutoff) this.purge(system, p.id);
    }
  }

  /* ---------- Notifications ---------- */

  tell(userIds, kind, editId, body) {
    const ids = [...new Set(userIds.filter(Boolean))];
    for (const userId of ids) {
      run(this.db, 'INSERT INTO notification (id, user_id, kind, edit_id, body, created_at) VALUES (?, ?, ?, ?, ?, ?)', newId('n'), userId, kind, editId, body.slice(0, 300), now());
    }
    this.hub.inbox(ids);
  }

  notifications(actor) {
    return all(this.db, 'SELECT id, kind, edit_id AS editId, body, created_at AS at, read_at AS readAt FROM notification WHERE user_id = ? ORDER BY created_at DESC LIMIT 40', actor.userId);
  }

  markRead(actor) {
    run(this.db, 'UPDATE notification SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), actor.userId);
  }
}
