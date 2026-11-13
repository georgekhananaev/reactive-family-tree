/*
 * The web API the app talks to. Each route says who may call it, and every
 * route is a thin wrapper: the rules live in the services, not here.
 */

import { fullName, person } from '../core/graph.js';
import { isAdmin } from '../core/privacy.js';
import { dump, restore } from './db.js';
import { badRequest, forbidden, notFound, signInFirst } from './errors.js';
import { exportGedcom, importGedcom } from './gedcom.js';
import { DEFAULT_SETTINGS } from './store.js';

/* ---------- Who may call ---------- */

const anyone = () => {};
const member = (ctx) => { if (!ctx.user) throw signInFirst(); };
const admin = (ctx) => { member(ctx); if (!isAdmin(ctx.actor)) throw forbidden('Only an admin can do that.'); };
const owner = (ctx) => { member(ctx); if (ctx.actor.role !== 'owner') throw forbidden('Only an owner can do that.'); };

/* ---------- Settings the admin can change, and what each must look like ---------- */

const bool = (value) => typeof value === 'boolean';
const SETTING_RULES = {
  familyName: (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= 80,
  description: (v) => typeof v === 'string' && v.length <= 200,
  visibility: (v) => ['private', 'public_masked', 'public'].includes(v),
  visitorsCanSuggest: bool, allowJoinRequests: bool, stewardsCanInvite: bool, stewardsReview: bool, allowAi: bool, allowAiDirect: bool,
  livingAge: (v) => Number.isInteger(v) && v >= 80 && v <= 130,
  aiWritesPerHour: (v) => Number.isInteger(v) && v >= 1 && v <= 1000,
  guidelines: (v) => typeof v === 'string' && v.length <= 4000,
};
/* What every browser is told, signed in or not. */
const PUBLIC_SETTINGS = ['familyName', 'description', 'visibility', 'visitorsCanSuggest', 'allowJoinRequests', 'allowAi', 'allowAiDirect', 'stewardsCanInvite'];

const editResult = (app, actor, result) => ({
  status: result.status, editId: result.edit?.id ?? null, warnings: result.warnings ?? [], created: result.created ?? {},
  reasons: result.reasons ?? [], remaining: result.remaining ?? 0,
  edit: result.edit ? app.edits.present(result.edit, actor) : null,
});

export function buildRoutes(app) {
  const { store, auth, edits, views } = app;
  const routes = [];
  const on = (method, pattern, guard, handler) => {
    const keys = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)'; })}$`);
    routes.push({ method, regex, keys, guard, handler });
  };
  const signIn = (ctx, user) => {
    ctx.startSession(auth.startSession(user.id));
    return { ok: true };
  };
  const personName = (id) => (person(store.state, id) ? fullName(person(store.state, id)) : null);

  /* ----- Session and sign-in ----- */

  on('GET', '/api/session', anyone, (ctx) => ({
    user: ctx.user && { id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: ctx.user.role, personId: ctx.user.person_id, anchors: ctx.actor.anchors },
    settings: Object.fromEntries(PUBLIC_SETTINGS.map((key) => [key, store.settings[key]])),
    counts: edits.counts(ctx.actor),
    // Ready-made accounts, so the demo can be tried as every role. A real install has none.
    demoAccounts: ctx.user ? [] : (store.settings.demoAccounts ?? []).map((account) => {
      const user = auth.members().find((m) => m.email === account.email);
      return user && { email: account.email, name: user.name, blurb: account.blurb };
    }).filter(Boolean),
  }));

  on('POST', '/api/auth/demo', anyone, (ctx) => {
    const listed = (store.settings.demoAccounts ?? []).some((account) => account.email === ctx.body.email);
    const user = listed && auth.members().find((m) => m.email === ctx.body.email);
    if (!user) throw notFound('That demo account does not exist.');
    return signIn(ctx, user);
  });

  // In the real app the link is emailed and this always answers "check your email".
  // The demo hands the link back so it can be shown on screen.
  on('POST', '/api/auth/link', anyone, (ctx) => {
    const token = auth.createLoginLink(ctx.body.email);
    return { sent: true, demoLink: token ? `${app.baseUrl}/?signin=${token}` : null };
  });
  on('POST', '/api/auth/redeem', anyone, (ctx) => signIn(ctx, auth.redeemLoginLink(ctx.body.token)));
  on('POST', '/api/auth/signout', anyone, (ctx) => {
    auth.endSession(ctx.sessionToken);
    ctx.endSession();
    return { ok: true };
  });

  on('GET', '/api/invites/open', anyone, (ctx) => {
    const invite = auth.openInvite(ctx.query.get('token'));
    return { email: invite.email, role: invite.role, personName: invite.person_id ? personName(invite.person_id) : null, invitedBy: invite.created_by };
  });
  on('POST', '/api/invites/accept', anyone, (ctx) => signIn(ctx, auth.acceptInvite(ctx.body.token, ctx.body)));
  on('POST', '/api/join', anyone, (ctx) => { auth.askToJoin(ctx.body); return { ok: true }; });

  /* ----- Reading the tree ----- */

  on('GET', '/api/tree', anyone, (ctx) => views.tree(ctx.actor));
  on('GET', '/api/people', anyone, (ctx) => ({ people: views.search(ctx.actor, ctx.query.get('q')) }));
  on('GET', '/api/people/:id', anyone, (ctx) => views.person(ctx.actor, ctx.params.id));
  on('GET', '/api/relationship', anyone, (ctx) => views.relationship(ctx.actor, ctx.query.get('from'), ctx.query.get('to')));

  /* ----- Edits: the one way anything changes ----- */

  on('POST', '/api/edits', anyone, (ctx) => {
    const { ops, message, note, mode = 'auto', contact } = ctx.body;
    if (!['auto', 'suggest', 'dry'].includes(mode)) throw badRequest('That is not a way to submit an edit.');
    let actor = ctx.actor;
    if (actor.visitor && mode !== 'dry') {
      const name = String(contact?.name ?? '').trim();
      const email = String(contact?.email ?? '').trim();
      if (!name || !email.includes('@')) throw badRequest('Leave your name and email so the family can reach you.');
      actor = auth.visitor({ name: name.slice(0, 80), email: email.slice(0, 120) });
    }
    return editResult(app, actor, edits.submit(actor, { ops, message, note, mode }));
  });
  on('GET', '/api/edits', member, (ctx) => {
    const which = ctx.query.get('which');
    if (!['review', 'mine', 'activity'].includes(which)) throw badRequest('Ask for review, mine or activity.');
    const personId = ctx.query.get('person');
    // A person's history is shown only to those who can see that person
    if (personId) views.person(ctx.actor, personId);
    return { edits: edits.list(ctx.actor, which, { personId }).map((edit) => edits.present(edit, ctx.actor)) };
  });
  on('GET', '/api/edits/:id', member, (ctx) => {
    const edit = edits.need(ctx.params.id);
    if (!edits.canSee(ctx.actor, edit)) throw notFound('That edit does not exist.');
    return edits.present(edit, ctx.actor);
  });
  on('POST', '/api/edits/:id/review', member, (ctx) => editResult(app, ctx.actor, edits.review(ctx.actor, ctx.params.id, ctx.body)));
  on('POST', '/api/edits/:id/withdraw', member, (ctx) => edits.withdraw(ctx.actor, ctx.params.id));
  on('POST', '/api/edits/:id/revert', member, (ctx) => editResult(app, ctx.actor, edits.revert(ctx.actor, ctx.params.id)));
  on('POST', '/api/edits/:id/apply', member, (ctx) => editResult(app, ctx.actor, edits.applyDraft(ctx.actor, ctx.params.id, ctx.body.indexes ?? null)));
  on('POST', '/api/edits/:id/discard', member, (ctx) => { edits.discardDraft(ctx.actor, ctx.params.id); return { ok: true }; });
  on('POST', '/api/edits/:id/comments', member, (ctx) => { edits.comment(ctx.actor, ctx.params.id, ctx.body.body); return { ok: true }; });

  on('GET', '/api/notifications', member, (ctx) => ({ notifications: edits.notifications(ctx.actor) }));
  on('POST', '/api/notifications/read', member, (ctx) => { edits.markRead(ctx.actor); return { ok: true }; });

  on('GET', '/api/compost', admin, () => ({ people: edits.compost() }));
  on('POST', '/api/compost/:id/purge', admin, (ctx) => { edits.purge(ctx.actor, ctx.params.id); return { ok: true }; });

  /* ----- Members, invitations, branches ----- */

  on('GET', '/api/members', member, (ctx) => {
    const named = (list) => list.map((item) => ({ ...item, personName: item.personId ? personName(item.personId) : null }));
    const members = named(auth.members()).map((m) => ({ ...m, anchorNames: m.anchors.map(personName) }));
    if (!isAdmin(ctx.actor)) return { members: members.map(({ id, name, role, personId, personName: leaf, anchors, anchorNames }) => ({ id, name, role, personId, personName: leaf, anchors, anchorNames })), invites: [], requests: [] };
    return {
      members,
      invites: auth.openInvites().map((invite) => ({ id: invite.id, email: invite.email, role: invite.role, personName: invite.person_id ? personName(invite.person_id) : null, by: invite.created_by })),
      requests: auth.joinRequests(),
    };
  });
  on('POST', '/api/invites', member, (ctx) => {
    const invite = auth.createInvite(ctx.actor, ctx.body);
    return { id: invite.id, link: `${app.baseUrl}/?invite=${invite.token}` };
  });
  on('DELETE', '/api/invites/:id', admin, (ctx) => { auth.cancelInvite(ctx.params.id); return { ok: true }; });
  on('PATCH', '/api/members/:id', admin, (ctx) => { auth.updateMember(ctx.actor, ctx.params.id, ctx.body); app.hub.inbox([ctx.params.id]); return { ok: true }; });
  on('DELETE', '/api/members/:id', admin, (ctx) => {
    if (ctx.params.id === ctx.user.id) throw badRequest('You cannot remove yourself. Ask another admin.');
    auth.removeMember(ctx.actor, ctx.params.id);
    return { ok: true };
  });
  on('POST', '/api/members/:id/branches', admin, (ctx) => { auth.addGrant(ctx.params.id, ctx.body.anchor, ctx.actor.name); app.hub.inbox([ctx.params.id]); return { ok: true }; });
  on('DELETE', '/api/members/:id/branches/:anchor', admin, (ctx) => { auth.removeGrant(ctx.params.id, ctx.params.anchor); app.hub.inbox([ctx.params.id]); return { ok: true }; });
  on('POST', '/api/join/:id', admin, (ctx) => {
    const invite = auth.decideJoin(ctx.actor, ctx.params.id, ctx.body.approve === true);
    return { link: invite ? `${app.baseUrl}/?invite=${invite.token}` : null };
  });

  /* ----- Health and settings ----- */

  on('GET', '/api/health', member, (ctx) => views.health(ctx.actor));
  on('GET', '/api/settings', admin, () => Object.fromEntries(Object.keys(SETTING_RULES).map((key) => [key, store.settings[key] ?? DEFAULT_SETTINGS[key]])));
  on('PATCH', '/api/settings', admin, (ctx) => {
    const patch = {};
    for (const [key, value] of Object.entries(ctx.body)) {
      if (!SETTING_RULES[key]?.(value)) throw badRequest(`"${key}" cannot be set to that.`);
      patch[key] = typeof value === 'string' ? value.trim() : value;
    }
    store.saveSettings(patch);
    app.hub.changed(store.seq);     // visibility or the living rule may have changed what people see
    return { ok: true };
  });

  /* ----- AI connections ----- */

  on('GET', '/api/connections', member, (ctx) => {
    const own = auth.connections(ctx.user.id);
    const everyone = isAdmin(ctx.actor) ? auth.connections().map((c) => ({ ...c, owner: auth.user(c.userId)?.name ?? 'Unknown' })) : [];
    return { address: `${app.baseUrl}/mcp`, connections: own, everyone };
  });
  on('POST', '/api/connections', member, (ctx) => auth.createConnection(ctx.user, ctx.body));
  on('PATCH', '/api/connections/:id', member, (ctx) => { auth.updateConnection(ctx.actor, ctx.params.id, ctx.body); return { ok: true }; });
  on('DELETE', '/api/connections/:id', member, (ctx) => { auth.revokeConnection(ctx.actor, ctx.params.id); return { ok: true }; });

  /* ----- Data in and out ----- */

  const download = (name, type, body) => ({ download: { name, type, body } });
  on('GET', '/api/export/gedcom', admin, () => download('family.ged', 'text/plain; charset=utf-8', exportGedcom(store.state, store.settings.familyName)));
  on('GET', '/api/export/backup', admin, () => download('family-backup.json', 'application/json', JSON.stringify({ format: 'reactive-family-tree-backup', version: 1, tables: dump(app.db) })));
  on('POST', '/api/import/gedcom', admin, (ctx) => {
    let parsed;
    try {
      parsed = importGedcom(ctx.body.text);
    } catch (error) {
      throw badRequest(error.message);
    }
    // Staged, never written directly: the admin previews it on the tree, then applies or discards it
    const result = edits.submit(ctx.actor, { ops: parsed.ops, message: `Import ${parsed.people} people from a GEDCOM file`, origin: 'import', mode: 'draft' });
    return { ...editResult(app, ctx.actor, result), people: parsed.people, families: parsed.families, skipped: parsed.skipped };
  });
  on('POST', '/api/import/backup', owner, (ctx) => {
    const backup = ctx.body.backup;
    if (backup?.format !== 'reactive-family-tree-backup' || typeof backup.tables !== 'object') throw badRequest('That is not a backup made by this app.');
    restore(app.db, backup.tables);
    store.load();
    app.hub.changed(store.seq);
    return { ok: true };
  });
  on('POST', '/api/demo/reset', owner, () => { app.reset(); return { ok: true }; });

  return routes;
}
