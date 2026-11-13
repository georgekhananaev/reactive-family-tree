/*
 * People of the app: accounts, sessions, invitations, branches, AI connections.
 *
 * Sign-in is passwordless. In this demo a magic link or an invitation link is
 * handed back to the page instead of being emailed, and that is the only
 * difference from the real thing: tokens are random, stored hashed, expire,
 * and work once.
 */

import { indexOf, person, scopeOf } from '../core/graph.js';
import { isAdmin } from '../core/privacy.js';
import { all, hashToken, later, newId, newToken, now, one, run } from './db.js';
import { badRequest, forbidden, notFound } from './errors.js';

const SESSION_DAYS = 30;
const ROLES = ['owner', 'admin', 'member'];
const MODES = ['review_first', 'apply_directly'];
const ACCESS = ['read', 'write', 'admin'];
const PROFILES = ['full', 'simple'];

const cleanEmail = (email) => String(email ?? '').trim().toLowerCase();

export class Auth {
  constructor(db, store) {
    this.db = db;
    this.store = store;
  }

  /* ---------- Who is acting ---------- */

  user(id) {
    return one(this.db, 'SELECT * FROM user WHERE id = ?', id);
  }

  anchors(userId) {
    return all(this.db, 'SELECT anchor_person_id FROM branch_grant WHERE user_id = ?', userId).map((row) => row.anchor_person_id);
  }

  /* The shape the shared rules expect. */
  actorFor(user) {
    return { userId: user.id, name: user.name, role: user.role, personId: user.person_id, anchors: this.anchors(user.id), visitor: false };
  }

  visitor(contact = null) {
    return { userId: null, name: contact?.name || 'A visitor', role: null, personId: null, anchors: [], visitor: true, contact };
  }

  /* For imports and seeding: acts as the family itself. */
  system(name = 'The family') {
    return { userId: null, name, role: 'owner', personId: null, anchors: [], visitor: false };
  }

  /* ---------- Sessions ---------- */

  startSession(userId) {
    const token = newToken('s_');
    run(this.db, 'INSERT INTO session (hash, user_id, expires_at) VALUES (?, ?, ?)', hashToken(token), userId, later(SESSION_DAYS));
    return token;
  }

  userForSession(token) {
    if (!token) return null;
    const row = one(this.db, 'SELECT user_id FROM session WHERE hash = ? AND expires_at > ?', hashToken(token), now());
    return row ? this.user(row.user_id) : null;
  }

  endSession(token) {
    if (token) run(this.db, 'DELETE FROM session WHERE hash = ?', hashToken(token));
  }

  /* ---------- Magic links ---------- */

  /* Returns the link's token, or null when nobody has that email. The caller answers the same either way. */
  createLoginLink(email) {
    const user = one(this.db, 'SELECT id FROM user WHERE email = ?', cleanEmail(email));
    if (!user) return null;
    const token = newToken('l_');
    run(this.db, 'INSERT INTO login_link (hash, user_id, expires_at) VALUES (?, ?, ?)', hashToken(token), user.id, later(1 / 96));
    return token;
  }

  redeemLoginLink(token) {
    const row = one(this.db, 'SELECT * FROM login_link WHERE hash = ?', hashToken(String(token)));
    if (!row || row.used_at || row.expires_at < now()) throw badRequest('That sign-in link has expired or was already used. Ask for a new one.');
    run(this.db, 'UPDATE login_link SET used_at = ? WHERE hash = ?', now(), row.hash);
    return this.user(row.user_id);
  }

  /* ---------- Invitations ---------- */

  createInvite(actor, { email = '', role = 'member', personId = null, grantBranch = true }) {
    const admin = isAdmin(actor);
    if (!admin) {
      if (!actor.anchors.length || !this.store.settings.stewardsCanInvite) throw forbidden('Only admins can invite people.');
      if (role !== 'member') throw forbidden('Stewards can invite members only.');
      const ix = indexOf(this.store.state);
      const scope = scopeOf(this.store.state, ix, actor.anchors);
      if (!personId || !(scope.core.has(personId) || scope.partners.has(personId))) throw forbidden('You can invite people in your own branch.');
    }
    if (!ROLES.includes(role)) throw badRequest('That is not a role.');
    if (role === 'owner' && actor.role !== 'owner') throw forbidden('Only an owner can invite another owner.');
    if (personId) {
      if (!person(this.store.state, personId)) throw badRequest('That person is not on the tree.');
      if (one(this.db, 'SELECT id FROM user WHERE person_id = ?', personId)) throw badRequest('Someone already signed in as that person.');
    }
    const token = newToken('i_');
    const id = newId('inv');
    run(this.db, `INSERT INTO invite (id, hash, email, role, person_id, grant_branch, created_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, hashToken(token), cleanEmail(email), role, personId, grantBranch ? 1 : 0, actor.name, now(), later(14));
    return { id, token };
  }

  openInvite(token) {
    const row = one(this.db, 'SELECT * FROM invite WHERE hash = ?', hashToken(String(token)));
    if (!row || row.used_at || row.expires_at < now()) throw badRequest('That invitation has expired or was already used.');
    return row;
  }

  acceptInvite(token, { name, email }) {
    const invite = this.openInvite(token);
    const address = cleanEmail(email || invite.email);
    if (!address.includes('@')) throw badRequest('Enter your email address.');
    if (!String(name ?? '').trim()) throw badRequest('Enter your name.');
    if (one(this.db, 'SELECT id FROM user WHERE email = ?', address)) throw badRequest('There is already an account with that email. Sign in instead.');
    const id = newId('usr');
    run(this.db, 'INSERT INTO user (id, email, name, role, person_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      id, address, String(name).trim(), invite.role, invite.person_id, now());
    if (invite.person_id && invite.grant_branch) this.addGrant(id, invite.person_id, invite.created_by);
    run(this.db, 'UPDATE invite SET used_at = ? WHERE id = ?', now(), invite.id);
    return this.user(id);
  }

  openInvites() {
    return all(this.db, 'SELECT id, email, role, person_id, created_by, expires_at FROM invite WHERE used_at IS NULL AND expires_at > ? ORDER BY created_at DESC', now());
  }

  cancelInvite(id) {
    run(this.db, 'DELETE FROM invite WHERE id = ? AND used_at IS NULL', id);
  }

  /* ---------- Members and branches ---------- */

  members() {
    const grants = all(this.db, 'SELECT user_id, anchor_person_id FROM branch_grant');
    const ai = all(this.db, 'SELECT user_id, MAX(last_used_at) AS last_used FROM connection WHERE revoked_at IS NULL GROUP BY user_id');
    return all(this.db, 'SELECT * FROM user ORDER BY created_at').map((user) => ({
      id: user.id, name: user.name, email: user.email, role: user.role, personId: user.person_id,
      anchors: grants.filter((g) => g.user_id === user.id).map((g) => g.anchor_person_id),
      ai: ai.find((row) => row.user_id === user.id) ? { lastUsedAt: ai.find((row) => row.user_id === user.id).last_used } : null,
    }));
  }

  updateMember(actor, id, { role, personId }) {
    const target = this.user(id);
    if (!target) throw notFound('That member does not exist.');
    if (role !== undefined && role !== target.role) {
      if (!ROLES.includes(role)) throw badRequest('That is not a role.');
      if ((role === 'owner' || target.role === 'owner') && actor.role !== 'owner') throw forbidden('Only an owner can add or remove owners.');
      this.keepAnOwner(target, role);
      run(this.db, 'UPDATE user SET role = ? WHERE id = ?', role, id);
    }
    if (personId !== undefined && personId !== target.person_id) {
      if (personId && !person(this.store.state, personId)) throw badRequest('That person is not on the tree.');
      if (personId && one(this.db, 'SELECT id FROM user WHERE person_id = ? AND id != ?', personId, id)) throw badRequest('Another member is already linked to that person.');
      run(this.db, 'UPDATE user SET person_id = ? WHERE id = ?', personId, id);
    }
  }

  keepAnOwner(target, nextRole) {
    if (target.role !== 'owner' || nextRole === 'owner') return;
    const owners = one(this.db, "SELECT COUNT(*) AS n FROM user WHERE role = 'owner'").n;
    if (owners <= 1) throw badRequest('A family tree always has at least one owner.');
  }

  removeMember(actor, id) {
    const target = this.user(id);
    if (!target) throw notFound('That member does not exist.');
    if (target.role === 'owner' && actor.role !== 'owner') throw forbidden('Only an owner can remove an owner.');
    this.keepAnOwner(target, null);
    for (const table of ['session', 'branch_grant', 'connection', 'notification']) run(this.db, `DELETE FROM ${table} WHERE user_id = ?`, id);
    run(this.db, 'DELETE FROM user WHERE id = ?', id);
  }

  addGrant(userId, anchor, grantedBy) {
    if (!this.user(userId)) throw notFound('That member does not exist.');
    if (!person(this.store.state, anchor)) throw badRequest('That person is not on the tree.');
    run(this.db, 'INSERT OR IGNORE INTO branch_grant (user_id, anchor_person_id, granted_by, created_at) VALUES (?, ?, ?, ?)', userId, anchor, grantedBy, now());
  }

  removeGrant(userId, anchor) {
    run(this.db, 'DELETE FROM branch_grant WHERE user_id = ? AND anchor_person_id = ?', userId, anchor);
  }

  /* ---------- Requests to join ---------- */

  askToJoin({ name, email, message }) {
    if (!this.store.settings.allowJoinRequests) throw forbidden('This family is not taking requests to join.');
    if (!String(name ?? '').trim() || !cleanEmail(email).includes('@')) throw badRequest('Enter your name and email address.');
    run(this.db, "INSERT INTO join_request (id, name, email, message, status, created_at) VALUES (?, ?, ?, ?, 'waiting', ?)",
      newId('jr'), String(name).trim().slice(0, 80), cleanEmail(email), String(message ?? '').slice(0, 1000), now());
  }

  joinRequests() {
    return all(this.db, "SELECT id, name, email, message, created_at FROM join_request WHERE status = 'waiting' ORDER BY created_at");
  }

  /* Approving turns the request into an invitation the admin can pass on. */
  decideJoin(actor, id, approve) {
    const request = one(this.db, "SELECT * FROM join_request WHERE id = ? AND status = 'waiting'", id);
    if (!request) throw notFound('That request is no longer waiting.');
    run(this.db, 'UPDATE join_request SET status = ?, decided_by = ? WHERE id = ?', approve ? 'approved' : 'declined', actor.name, id);
    return approve ? this.createInvite(actor, { email: request.email, role: 'member', grantBranch: false }) : null;
  }

  /* ---------- AI connections ---------- */

  createConnection(user, { name, mode = 'review_first', access = 'write', profile = 'full' }) {
    const settings = this.store.settings;
    if (!settings.allowAi) throw forbidden('AI connections are turned off for this family.');
    const fields = this.connectionFields(user, { name, mode, access, profile });
    const token = newToken('rft_');
    const id = newId('con');
    run(this.db, 'INSERT INTO connection (id, user_id, name, token_hash, mode, access, profile, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      id, user.id, fields.name, hashToken(token), fields.mode, fields.access, fields.profile, now());
    return { id, token };
  }

  connectionFields(user, { name, mode, access, profile }) {
    if (!String(name ?? '').trim()) throw badRequest('Give the connection a name, such as "Claude on my laptop".');
    if (!MODES.includes(mode) || !ACCESS.includes(access) || !PROFILES.includes(profile)) throw badRequest('That is not a valid connection setting.');
    if (mode === 'apply_directly' && !this.store.settings.allowAiDirect) throw forbidden('The admin has turned off "apply directly" for AI connections.');
    if (access === 'admin' && !isAdmin(user)) throw forbidden('Only an admin can create an admin connection.');
    return { name: String(name).trim().slice(0, 80), mode, access, profile };
  }

  connections(userId = null) {
    const rows = userId
      ? all(this.db, 'SELECT * FROM connection WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC', userId)
      : all(this.db, 'SELECT * FROM connection WHERE revoked_at IS NULL ORDER BY created_at DESC');
    return rows.map((row) => ({
      id: row.id, userId: row.user_id, name: row.name, mode: row.mode, access: row.access, profile: row.profile,
      createdAt: row.created_at, lastUsedAt: row.last_used_at,
    }));
  }

  ownConnection(actor, id) {
    const row = one(this.db, 'SELECT * FROM connection WHERE id = ? AND revoked_at IS NULL', id);
    if (!row || (row.user_id !== actor.userId && !isAdmin(actor))) throw notFound('That connection does not exist.');
    return row;
  }

  updateConnection(actor, id, patch) {
    const row = this.ownConnection(actor, id);
    const fields = this.connectionFields(this.user(row.user_id), {
      name: patch.name ?? row.name, mode: patch.mode ?? row.mode, access: patch.access ?? row.access, profile: patch.profile ?? row.profile,
    });
    run(this.db, 'UPDATE connection SET name = ?, mode = ?, access = ?, profile = ? WHERE id = ?', fields.name, fields.mode, fields.access, fields.profile, id);
  }

  revokeConnection(actor, id) {
    this.ownConnection(actor, id);
    run(this.db, 'UPDATE connection SET revoked_at = ? WHERE id = ?', now(), id);
  }

  /* The bearer token an AI client sends. Returns the connection and its owner, or null. */
  connectionForToken(token) {
    if (!token || !this.store.settings.allowAi) return null;
    const row = one(this.db, 'SELECT * FROM connection WHERE token_hash = ? AND revoked_at IS NULL', hashToken(token));
    if (!row) return null;
    run(this.db, 'UPDATE connection SET last_used_at = ? WHERE id = ?', now(), row.id);
    const mode = this.store.settings.allowAiDirect ? row.mode : 'review_first';
    return { connection: { id: row.id, name: row.name, mode, access: row.access, profile: row.profile }, user: this.user(row.user_id) };
  }
}
