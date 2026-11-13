/*
 * People of the app: members, invitations, branches, requests to join and AI
 * connections.
 *
 * Signing in itself (magic links, passkeys, sessions) belongs to the sign-in
 * library and lives in auth.ts. This module decides who a signed-in person is
 * to the family: their role, their leaf and the branches they look after.
 */

import { indexOf, isAdmin, person, scopeOf } from '@reactive-family-tree/core';
import type { Actor, ConnectionAccess, ConnectionMode, ConnectionView, Contact, Role, ToolProfile } from '@reactive-family-tree/core';
import { account, aiConnection, branchGrant, invite, joinRequest, notification, oauthClient, passkey, session, user } from '@reactive-family-tree/db';
import type { Database } from '@reactive-family-tree/db';
import { and, asc, count, desc, eq, gt, isNull, ne } from 'drizzle-orm';

import { badRequest, forbidden, notFound, tooMany } from './errors';
import { hashToken, later, newId, newToken, now } from './ids';
import type { FamilyStore } from './store';

export type UserRow = typeof user.$inferSelect;
export type InviteRow = typeof invite.$inferSelect;
type ConnectionRow = typeof aiConnection.$inferSelect;

const ROLES: readonly Role[] = ['owner', 'admin', 'member'];
const MODES: readonly ConnectionMode[] = ['review_first', 'apply_directly'];
const ACCESS: readonly ConnectionAccess[] = ['read', 'write', 'admin'];
const PROFILES: readonly ToolProfile[] = ['full', 'simple'];
/*
 * Asking to join needs no account, and nothing proves that an email address
 * is the asker's own. So the form is kept from doing harm rather than made
 * clever: each sender gets a few tries an hour, every request is shown to an
 * admin as it was written, and what waits is never thrown away or written
 * over. Only so many can wait at once, which keeps the form from filling the
 * disk. A flood that reaches that limit closes the form until an admin has
 * cleared the list, or turned off "People can ask to join".
 */
const ASKS_PER_HOUR = 5;     // from one address on the network
const MAX_ASKERS = 500;      // addresses remembered within the hour, so that the memory of them cannot be made to grow
const MAX_WAITING = 200;     // requests waiting at once
/* How long an invitation stays good. */
export const INVITE_DAYS = 14;

const cleanEmail = (email: unknown) => String(email ?? '').trim().toLowerCase();
export const roleOf = (row: Pick<UserRow, 'role'>): Role => (ROLES.includes(row.role as Role) ? (row.role as Role) : 'member');

export interface InviteInput {
  email?: string;
  role?: Role;
  personId?: string | null;
  grantBranch?: boolean;
}

/* An invitation just made. The token is shown once, here, and kept only as a hash. */
export interface NewInvite {
  id: string;
  token: string;
  /* Who it is for, or '' when it is for anyone holding the link. */
  email: string;
}

export interface ConnectionInput {
  name?: string;
  mode?: ConnectionMode;
  access?: ConnectionAccess;
  profile?: ToolProfile;
}

/* The connection an AI client is acting through, with the settings that apply right now. */
export interface ActiveConnection {
  id: string;
  name: string;
  mode: ConnectionMode;
  access: ConnectionAccess;
  profile: ToolProfile;
}

export interface MemberRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  personId: string | null;
  anchors: string[];
  ai: { lastUsedAt: string | null } | null;
}

export class Members {
  /* How many times each address on the network has asked to join since the hour began. */
  private asks = { since: 0, from: new Map<string, number>() };

  constructor(
    private readonly db: Database,
    private readonly store: FamilyStore,
  ) {}

  /* ---------- Who is acting ---------- */

  async user(id: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(user).where(eq(user.id, id));
    return row ?? null;
  }

  async userByEmail(email: string): Promise<UserRow | null> {
    const [row] = await this.db.select().from(user).where(eq(user.email, cleanEmail(email)));
    return row ?? null;
  }

  async anchors(userId: string): Promise<string[]> {
    const rows = await this.db.select({ anchor: branchGrant.anchorPersonId }).from(branchGrant).where(eq(branchGrant.userId, userId));
    return rows.map((row) => row.anchor);
  }

  /* The shape the shared rules expect. */
  async actorFor(row: UserRow): Promise<Actor> {
    return { userId: row.id, name: row.name, role: roleOf(row), personId: row.personId, anchors: await this.anchors(row.id), visitor: false };
  }

  /* Every member as the rules see them, for working out who may review something. */
  async actors(): Promise<Actor[]> {
    const [users, grants] = await Promise.all([this.db.select().from(user), this.db.select().from(branchGrant)]);
    return users.map((row) => ({
      userId: row.id,
      name: row.name,
      role: roleOf(row),
      personId: row.personId,
      anchors: grants.filter((grant) => grant.userId === row.id).map((grant) => grant.anchorPersonId),
      visitor: false,
    }));
  }

  visitor(contact: Contact | null = null): Actor {
    return { userId: null, name: contact?.name || 'A visitor', role: null, personId: null, anchors: [], visitor: true, contact };
  }

  /* For imports, seeding and scheduled work: acts as the family itself. */
  system(name = 'The family'): Actor {
    return { userId: null, name, role: 'owner', personId: null, anchors: [], visitor: false };
  }

  /* ---------- Accounts ---------- */

  /* An account, made by an invitation, by the first-run setup, or when planting the demo family. */
  async createUser(fields: { name: string; email: string; role: Role; personId: string | null }): Promise<UserRow> {
    const at = new Date();
    const row = { id: newId('usr'), ...fields, email: cleanEmail(fields.email), emailVerified: true, image: null, createdAt: at, updatedAt: at };
    await this.db.insert(user).values(row);
    return row;
  }

  /* Whether this member can sign in with a passkey, which needs no email to arrive. */
  async hasPasskey(userId: string): Promise<boolean> {
    const [found] = await this.db.select({ id: passkey.id }).from(passkey).where(eq(passkey.userId, userId)).limit(1);
    return Boolean(found);
  }

  async ownerCount(): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(user).where(eq(user.role, 'owner'));
    return row?.n ?? 0;
  }

  /* ---------- Invitations ---------- */

  async createInvite(actor: Actor, { email = '', role = 'member', personId = null, grantBranch = true }: InviteInput): Promise<NewInvite> {
    const { state, settings } = this.store;
    if (!isAdmin(actor)) {
      if (!actor.anchors.length || !settings.stewardsCanInvite) throw forbidden('Only admins can invite people.');
      if (role !== 'member') throw forbidden('Stewards can invite members only.');
      const scope = scopeOf(state, indexOf(state), actor.anchors);
      if (!personId || !(scope.core.has(personId) || scope.partners.has(personId))) throw forbidden('You can invite people in your own branch.');
    }
    if (!ROLES.includes(role)) throw badRequest('That is not a role.');
    if (role === 'owner' && actor.role !== 'owner') throw forbidden('Only an owner can invite another owner.');
    if (personId) {
      if (!person(state, personId)) throw badRequest('That person is not on the tree.');
      const [taken] = await this.db.select({ id: user.id }).from(user).where(eq(user.personId, personId));
      if (taken) throw badRequest('Someone already signed in as that person.');
    }
    const token = newToken('i_');
    const id = newId('inv');
    const to = cleanEmail(email);
    await this.db.insert(invite).values({
      id, tokenHash: hashToken(token), email: to, role, personId, grantBranch, createdBy: actor.name, createdAt: now(), expiresAt: later(INVITE_DAYS), usedAt: null,
    });
    return { id, token, email: to };
  }

  async openInvite(token: unknown): Promise<InviteRow> {
    const [row] = await this.db.select().from(invite).where(eq(invite.tokenHash, hashToken(String(token))));
    if (!row || row.usedAt || row.expiresAt < now()) throw badRequest('That invitation has expired or was already used.');
    return row;
  }

  async acceptInvite(token: unknown, { name, email }: { name?: unknown; email?: unknown }): Promise<UserRow> {
    const found = await this.openInvite(token);
    const address = cleanEmail(email || found.email);
    if (!address.includes('@')) throw badRequest('Enter your email address.');
    if (!String(name ?? '').trim()) throw badRequest('Enter your name.');
    if (await this.userByEmail(address)) throw badRequest('There is already an account with that email. Sign in instead.');
    const created = await this.createUser({ name: String(name).trim(), email: address, role: found.role, personId: found.personId });
    if (found.personId && found.grantBranch) await this.addGrant(created.id, found.personId, found.createdBy);
    await this.db.update(invite).set({ usedAt: now() }).where(eq(invite.id, found.id));
    return created;
  }

  async openInvites(): Promise<InviteRow[]> {
    return this.db.select().from(invite).where(and(isNull(invite.usedAt), gt(invite.expiresAt, now()))).orderBy(desc(invite.createdAt));
  }

  async cancelInvite(id: string): Promise<void> {
    await this.db.delete(invite).where(and(eq(invite.id, id), isNull(invite.usedAt)));
  }

  /* ---------- Members and branches ---------- */

  async members(): Promise<MemberRecord[]> {
    const [users, grants, connections] = await Promise.all([
      this.db.select().from(user).orderBy(asc(user.createdAt)),
      this.db.select().from(branchGrant),
      this.db.select().from(aiConnection).where(isNull(aiConnection.revokedAt)),
    ]);
    return users.map((row) => {
      const own = connections.filter((connection) => connection.userId === row.id);
      const lastUsedAt = own.map((connection) => connection.lastUsedAt).filter((at): at is string => Boolean(at)).sort().at(-1) ?? null;
      return {
        id: row.id, name: row.name, email: row.email, role: roleOf(row), personId: row.personId,
        anchors: grants.filter((grant) => grant.userId === row.id).map((grant) => grant.anchorPersonId),
        ai: own.length ? { lastUsedAt } : null,
      };
    });
  }

  private async need(id: string): Promise<UserRow> {
    const target = await this.user(id);
    if (!target) throw notFound('That member does not exist.');
    return target;
  }

  async updateMember(actor: Actor, id: string, { role, personId }: { role?: Role; personId?: string | null }): Promise<void> {
    const target = await this.need(id);
    const currentRole = roleOf(target);
    if (role !== undefined && role !== currentRole) {
      if (!ROLES.includes(role)) throw badRequest('That is not a role.');
      if ((role === 'owner' || currentRole === 'owner') && actor.role !== 'owner') throw forbidden('Only an owner can add or remove owners.');
      await this.keepAnOwner(currentRole, role);
      await this.db.update(user).set({ role }).where(eq(user.id, id));
    }
    if (personId !== undefined && personId !== target.personId) {
      if (personId && !person(this.store.state, personId)) throw badRequest('That person is not on the tree.');
      if (personId) {
        const [taken] = await this.db.select({ id: user.id }).from(user).where(and(eq(user.personId, personId), ne(user.id, id)));
        if (taken) throw badRequest('Another member is already linked to that person.');
      }
      await this.db.update(user).set({ personId }).where(eq(user.id, id));
    }
  }

  private async keepAnOwner(currentRole: Role, nextRole: Role | null): Promise<void> {
    if (currentRole !== 'owner' || nextRole === 'owner') return;
    if ((await this.ownerCount()) <= 1) throw badRequest('A family tree always has at least one owner.');
  }

  async removeMember(actor: Actor, id: string): Promise<void> {
    const target = await this.need(id);
    const role = roleOf(target);
    if (role === 'owner' && actor.role !== 'owner') throw forbidden('Only an owner can remove an owner.');
    await this.keepAnOwner(role, null);
    await this.db.transaction(async (tx) => {
      await tx.delete(session).where(eq(session.userId, id));
      await tx.delete(account).where(eq(account.userId, id));
      await tx.delete(passkey).where(eq(passkey.userId, id));
      await tx.delete(branchGrant).where(eq(branchGrant.userId, id));
      await tx.delete(aiConnection).where(eq(aiConnection.userId, id));
      await tx.delete(notification).where(eq(notification.userId, id));
      await tx.delete(user).where(eq(user.id, id));
    });
  }

  async addGrant(userId: string, anchor: string, grantedBy: string): Promise<void> {
    await this.need(userId);
    if (!person(this.store.state, anchor)) throw badRequest('That person is not on the tree.');
    await this.db.insert(branchGrant).values({ userId, anchorPersonId: anchor, grantedBy, createdAt: now() }).onConflictDoNothing();
  }

  async removeGrant(userId: string, anchor: string): Promise<void> {
    await this.db.delete(branchGrant).where(and(eq(branchGrant.userId, userId), eq(branchGrant.anchorPersonId, anchor)));
  }

  /* ---------- Requests to join ---------- */

  /* `from` is where on the network the request came from, when that is known. */
  async askToJoin({ name, email, message }: { name?: unknown; email?: unknown; message?: unknown }, from: string | null): Promise<void> {
    if (!this.store.settings.allowJoinRequests) throw forbidden('This family is not taking requests to join.');
    const address = cleanEmail(email);
    // No real address is longer than 254 letters
    if (!String(name ?? '').trim() || !address.includes('@') || address.length > 254) throw badRequest('Enter your name and email address.');
    // Senders nothing is known about are not counted together, or one of them could use up the tries of all the rest
    if (from && !this.mayAsk(from)) throw tooMany('That is a lot of requests in a short time. Try again in an hour.');
    const [waiting] = await this.db.select({ n: count() }).from(joinRequest).where(eq(joinRequest.status, 'waiting'));
    if ((waiting?.n ?? 0) >= MAX_WAITING) throw tooMany('Many requests are waiting to be read already. Ask a relative to invite you instead.');
    await this.db.insert(joinRequest).values({
      id: newId('jr'), name: String(name).trim().slice(0, 80), email: address, message: String(message ?? '').slice(0, 1000), status: 'waiting', decidedBy: null, createdAt: now(),
    });
  }

  /* Whether this sender may ask to join once more this hour. The count starts afresh every hour, for everyone. */
  private mayAsk(from: string): boolean {
    if (Date.now() - this.asks.since > 3_600_000) this.asks = { since: Date.now(), from: new Map() };
    const counts = this.asks.from;
    // With more senders in an hour than can be remembered, the one remembered longest is forgotten. Nobody new is turned away for that.
    const [longest] = counts.keys();
    if (!counts.has(from) && counts.size >= MAX_ASKERS && longest !== undefined) counts.delete(longest);
    const times = (counts.get(from) ?? 0) + 1;
    counts.set(from, times);
    return times <= ASKS_PER_HOUR;
  }

  async joinRequests() {
    return this.db.select().from(joinRequest).where(eq(joinRequest.status, 'waiting')).orderBy(asc(joinRequest.createdAt));
  }

  /* Approving turns the request into an invitation the admin can pass on. */
  async decideJoin(actor: Actor, id: string, approve: boolean): Promise<NewInvite | null> {
    const [request] = await this.db.select().from(joinRequest).where(and(eq(joinRequest.id, id), eq(joinRequest.status, 'waiting')));
    if (!request) throw notFound('That request is no longer waiting.');
    await this.db.update(joinRequest).set({ status: approve ? 'approved' : 'declined', decidedBy: actor.name }).where(eq(joinRequest.id, id));
    return approve ? this.createInvite(actor, { email: request.email, role: 'member', grantBranch: false }) : null;
  }

  /* ---------- AI connections ---------- */

  /* A connection that carries a personal token. The token is returned once and only its hash is kept. */
  async createConnection(owner: UserRow, input: ConnectionInput): Promise<{ id: string; token: string }> {
    if (!this.store.settings.allowAi) throw forbidden('AI connections are turned off for this family.');
    const fields = this.connectionFields(owner, { mode: 'review_first', access: 'write', profile: 'full', ...input });
    const token = newToken('rft_');
    const id = newId('con');
    await this.db.insert(aiConnection).values({ id, userId: owner.id, kind: 'token', tokenHash: hashToken(token), oauthClientId: null, ...fields, createdAt: now(), lastUsedAt: null, revokedAt: null });
    return { id, token };
  }

  private connectionFields(owner: Pick<UserRow, 'role'>, { name, mode, access, profile }: ConnectionInput) {
    if (!String(name ?? '').trim()) throw badRequest('Give the connection a name, such as "Claude on my laptop".');
    if (!MODES.includes(mode as ConnectionMode) || !ACCESS.includes(access as ConnectionAccess) || !PROFILES.includes(profile as ToolProfile)) throw badRequest('That is not a valid connection setting.');
    if (mode === 'apply_directly' && !this.store.settings.allowAiDirect) throw forbidden('The admin has turned off "apply directly" for AI connections.');
    const admin = roleOf(owner) !== 'member';
    if (access === 'admin' && !admin) throw forbidden('Only an admin can create an admin connection.');
    return { name: String(name).trim().slice(0, 80), mode: mode as ConnectionMode, access: access as ConnectionAccess, profile: profile as ToolProfile };
  }

  async connections(userId: string | null = null): Promise<ConnectionView[]> {
    const live = isNull(aiConnection.revokedAt);
    const rows = await this.db.select().from(aiConnection).where(userId ? and(eq(aiConnection.userId, userId), live) : live).orderBy(desc(aiConnection.createdAt));
    return rows.map((row) => ({
      id: row.id, userId: row.userId, name: row.name, kind: row.kind, mode: row.mode, access: row.access, profile: row.profile, createdAt: row.createdAt, lastUsedAt: row.lastUsedAt,
    }));
  }

  private async ownConnection(actor: Actor, id: string): Promise<ConnectionRow> {
    const [row] = await this.db.select().from(aiConnection).where(and(eq(aiConnection.id, id), isNull(aiConnection.revokedAt)));
    if (!row || (row.userId !== actor.userId && !isAdmin(actor))) throw notFound('That connection does not exist.');
    return row;
  }

  async updateConnection(actor: Actor, id: string, patch: ConnectionInput): Promise<void> {
    const row = await this.ownConnection(actor, id);
    const owner = await this.need(row.userId);
    const fields = this.connectionFields(owner, {
      name: patch.name ?? row.name, mode: patch.mode ?? row.mode, access: patch.access ?? row.access, profile: patch.profile ?? row.profile,
    });
    await this.db.update(aiConnection).set(fields).where(eq(aiConnection.id, id));
  }

  async revokeConnection(actor: Actor, id: string): Promise<void> {
    await this.ownConnection(actor, id);
    await this.db.update(aiConnection).set({ revokedAt: now() }).where(eq(aiConnection.id, id));
  }

  private async use(row: ConnectionRow): Promise<{ connection: ActiveConnection; user: UserRow } | null> {
    const owner = await this.user(row.userId);
    if (!owner) return null;
    await this.db.update(aiConnection).set({ lastUsedAt: now() }).where(eq(aiConnection.id, row.id));
    // The admin can take "apply directly" away from everyone at once
    const mode = this.store.settings.allowAiDirect ? row.mode : 'review_first';
    return { connection: { id: row.id, name: row.name, mode, access: row.access, profile: row.profile }, user: owner };
  }

  /* The bearer token an AI client sends. Returns the connection and its owner, or null. */
  async connectionForToken(token: string | null): Promise<{ connection: ActiveConnection; user: UserRow } | null> {
    if (!token || !this.store.settings.allowAi) return null;
    const [row] = await this.db.select().from(aiConnection).where(and(eq(aiConnection.tokenHash, hashToken(token)), isNull(aiConnection.revokedAt)));
    return row ? this.use(row) : null;
  }

  /*
   * An AI client that signed in as a member. The first time it is seen it gets
   * a connection of its own, review first, so its settings can be changed on
   * the "Connect your AI" screen like any other. Revoking that connection
   * shuts the client out even while its sign-in is still valid.
   */
  async connectionForClient(userId: string, clientId: string): Promise<{ connection: ActiveConnection; user: UserRow } | null> {
    if (!this.store.settings.allowAi) return null;
    const mine = and(eq(aiConnection.userId, userId), eq(aiConnection.oauthClientId, clientId));
    const [existing] = await this.db.select().from(aiConnection).where(mine).orderBy(desc(aiConnection.createdAt)).limit(1);
    if (existing) return existing.revokedAt ? null : this.use(existing);
    const [client] = await this.db.select({ name: oauthClient.name }).from(oauthClient).where(eq(oauthClient.clientId, clientId));
    const row: ConnectionRow = {
      id: newId('con'), userId, name: client?.name?.slice(0, 80) || 'AI client', kind: 'oauth', tokenHash: null, oauthClientId: clientId,
      mode: 'review_first', access: 'write', profile: 'full', createdAt: now(), lastUsedAt: null, revokedAt: null,
    };
    await this.db.insert(aiConnection).values(row);
    return this.use(row);
  }
}
