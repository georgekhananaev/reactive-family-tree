/*
 * The web API the app talks to, as one function from a request to a response.
 * It needs no web framework: the Next.js app mounts it, and the tests call it
 * directly. Each route says who may call it, and every route is a thin
 * wrapper: the rules live in the services, not here.
 */

import { LANG_COOKIE, TEXT_FIELDS, chooseLang, cookieOf, fullName, inLanguage as worded, isAdmin, isLang, person, say } from '@reactive-family-tree/core';
import type { Actor, ConnectionsInfo, EditResult, Lang, MembersInfo, OpenInvite, Role, SessionInfo, State } from '@reactive-family-tree/core';
import { exportGedcom, importGedcom } from '@reactive-family-tree/gedcom';

import type { App } from './app';
import { dump, restore } from './backup';
import type { SubmitResult } from './edits';
import { HttpError, badRequest, forbidden, notFound, signInFirst } from './errors';
import { deliverInvite } from './invites';
import type { ConnectionInput, InviteInput, UserRow } from './members';
import { roleOf } from './members';
import { resetDemo } from './seed';
import { SETTING_HINTS, SETTING_RULES, adminSettings, familyPatch, familyText, isFamilyField, publicSettings } from './settings';
import type { Settings } from './settings';
import { translationsOf } from './translations';
import { inLanguage, tell } from './words';

const MAX_BODY = 12 * 1024 * 1024;

type Body = Record<string, unknown>;

interface Context {
  request: Request;
  user: UserRow | null;
  /* The language to answer in. The actor carries it too, for the services. */
  lang: Lang;
  actor: Actor;
  body: Body;
  query: URLSearchParams;
  params: Record<string, string>;
}

/* A file for the browser to save, instead of JSON. */
interface Download {
  download: { name: string; type: string; body: string };
}

type Guard = (ctx: Context) => void;
type Handler = (ctx: Context) => unknown;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  guard: Guard;
  handler: Handler;
}

/* ---------- Who may call ---------- */

const anyone: Guard = () => {};
const member: Guard = (ctx) => { if (!ctx.user) throw signInFirst(); };
const admin: Guard = (ctx) => { member(ctx); if (!isAdmin(ctx.actor)) throw forbidden('Only an admin can do that.'); };
const owner: Guard = (ctx) => { member(ctx); if (ctx.actor.role !== 'owner') throw forbidden('Only an owner can do that.'); };

const json = (status: number, payload: unknown): Response =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

/*
 * What was sent, as JSON. It is counted as it arrives and dropped the moment
 * it passes the limit, so that nobody can fill the server's memory by sending
 * something enormous.
 */
async function readBody(request: Request): Promise<Body> {
  if (request.method === 'GET' || !request.body) return {};
  const tooLarge = () => new HttpError(413, 'That is too large to send.');
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw tooLarge();
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of request.body as unknown as AsyncIterable<Uint8Array>) {
    size += part.byteLength;
    if (size > MAX_BODY) throw tooLarge();
    parts.push(part);
  }
  const raw = Buffer.concat(parts).toString('utf8');
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Body) : {};
  } catch {
    throw badRequest('That is not valid JSON.');
  }
}

export function createApi(app: App): (request: Request) => Promise<Response> {
  const { config, store, members, edits, views, media, hub } = app;
  const routes: Route[] = [];
  const on = (method: string, pattern: string, guard: Guard, handler: Handler) => {
    const keys: string[] = [];
    const regex = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, key: string) => { keys.push(key); return '([^/]+)'; })}$`);
    routes.push({ method, regex, keys, guard, handler });
  };
  const personName = (id: string | null, lang: Lang = store.settings.language) => { const found = id ? person(store.state, id) : null; return found ? fullName(found, lang) : null; };
  /* The family as it reads in one language, for a file that holds one: each person's words in it, or as they were written. */
  const readingIn = (lang: Lang): State => ({
    people: new Map([...store.state.people].map(([key, p]) => [key, worded(p, TEXT_FIELDS.people, lang)])),
    unions: store.state.unions,
    facts: new Map([...store.state.facts].map(([key, fact]) => [key, worded(fact, TEXT_FIELDS.facts, lang)])),
    memories: new Map([...store.state.memories].map(([key, memory]) => [key, worded(memory, TEXT_FIELDS.memories, lang)])),
  });
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  const id = (ctx: Context) => ctx.params.id as string;
  const self = (ctx: Context) => ctx.user as UserRow;

  const editResult = async (actor: Actor, result: SubmitResult): Promise<EditResult> => ({
    status: result.status, editId: result.edit?.id ?? null, warnings: result.warnings, created: result.created,
    reasons: result.reasons, remaining: result.remaining,
    edit: result.edit ? await edits.present(result.edit, actor) : null,
  });

  /* ----- Session ----- */

  on('GET', '/api/session', anyone, async (ctx): Promise<SessionInfo> => {
    const offered = ctx.user || !config.demoMode ? [] : store.settings.demoAccounts;
    const everyone = offered.length ? await members.members() : [];
    return {
      user: ctx.user && {
        id: ctx.user.id, name: ctx.user.name, email: ctx.user.email, role: roleOf(ctx.user), personId: ctx.user.personId, anchors: ctx.actor.anchors,
        hasPasskey: await members.hasPasskey(ctx.user.id), language: isLang(ctx.user.language) ? ctx.user.language : null,
      },
      settings: publicSettings(store.settings, Boolean(ctx.user), ctx.lang),
      counts: await edits.counts(ctx.actor),
      // Ready-made accounts, so the demo can be tried as every role. A real install has none.
      demoAccounts: offered.flatMap((account) => {
        const found = everyone.find((m) => m.email === account.email);
        return found ? [{ email: account.email, name: found.name, blurb: account.blurb }] : [];
      }),
      signIn: { google: Boolean(config.google), passkeys: true, emailWorks: app.mailer.delivers },
      needsSetup: await app.needsSetup(),
      demo: config.demoMode,
      lang: ctx.lang,
    };
  });
  // A member's own choice of language, kept with their account so that mail and notices reach them in it
  on('PATCH', '/api/me/language', member, async (ctx) => {
    const language = ctx.body.language;
    if (language !== null && !isLang(language)) throw badRequest('Choose English, Hebrew or Russian.');
    await members.setLanguage(self(ctx).id, language);
    return { ok: true };
  });
  on('GET', '/api/seq', anyone, () => ({ seq: store.seq }));

  // With no email configured, a demo install hands the sign-in link to the page that asked for it
  // Only for the ready-made accounts of the made-up family: a link to anyone else's account is never handed to a page.
  on('GET', '/api/demo/link', anyone, (ctx) => {
    const email = text(ctx.query.get('email')).trim().toLowerCase();
    if (!config.demoMode || !store.settings.demoAccounts.some((account) => account.email.toLowerCase() === email)) throw notFound();
    return { link: app.takeLink(email) };
  });

  on('GET', '/api/invites/open', anyone, async (ctx): Promise<OpenInvite> => {
    const found = await members.openInvite(ctx.query.get('token'));
    return { email: found.email, role: found.role, personName: personName(found.personId, ctx.lang), invitedBy: found.createdBy };
  });
  // Who is asking is known only by where the request came from. The nearest proxy writes that last, and the server itself fills it in
  // for someone who connects with no proxy between.
  on('POST', '/api/join', anyone, async (ctx) => {
    await members.askToJoin(ctx.body, ctx.request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() || null);
    return { ok: true };
  });

  /* ----- Reading the tree ----- */

  on('GET', '/api/tree', anyone, (ctx) => views.tree(ctx.actor));
  on('GET', '/api/people', anyone, (ctx) => ({ people: views.search(ctx.actor, ctx.query.get('q')) }));
  on('GET', '/api/people/:id', anyone, (ctx) => views.person(ctx.actor, id(ctx)));
  /*
   * Photos. A relative sends one, already cropped and shrunk by the browser,
   * and gets back its id to put on a person through an ordinary edit. Reading
   * goes by person, never by id, so a photo is seen exactly by those who may
   * see the person.
   */
  on('POST', '/api/media', member, async (ctx) => ({ id: await media.save(ctx.actor, ctx.body.image) }));
  on('GET', '/api/people/:id/portrait', anyone, async (ctx) => {
    const photo = views.portraitOf(ctx.actor, id(ctx));
    const bytes = photo ? await media.read(photo) : null;
    if (!photo || !bytes) throw notFound('There is no photo here.');
    // The address carries the photo's id, so a new photo is a new address and this one never changes
    const fixed = ctx.query.get('v') === photo;
    return new Response(bytes, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': fixed ? 'private, max-age=31536000, immutable' : 'private, no-cache', 'X-Content-Type-Options': 'nosniff' } });
  });
  on('GET', '/api/relationship', anyone, (ctx) => views.relationship(ctx.actor, text(ctx.query.get('from')), text(ctx.query.get('to'))));

  /* ----- Edits: the one way anything changes ----- */

  on('POST', '/api/edits', anyone, async (ctx) => {
    const { ops, message, note, mode = 'auto' } = ctx.body;
    if (mode !== 'auto' && mode !== 'suggest' && mode !== 'dry') throw badRequest('That is not a way to submit an edit.');
    let actor = ctx.actor;
    if (actor.visitor && mode !== 'dry') {
      const contact = (ctx.body.contact ?? {}) as { name?: unknown; email?: unknown };
      const name = text(contact.name).trim();
      const email = text(contact.email).trim();
      if (!name || !email.includes('@')) throw badRequest('Leave your name and email so the family can reach you.');
      actor = { ...members.visitor({ name: name.slice(0, 80), email: email.slice(0, 120) }), lang: ctx.lang };
    }
    return editResult(actor, await edits.submit(actor, { ops, message, note, mode }));
  });
  on('GET', '/api/edits', member, async (ctx) => {
    const which = ctx.query.get('which');
    if (which !== 'review' && which !== 'mine' && which !== 'activity') throw badRequest('Ask for review, mine or activity.');
    const personId = ctx.query.get('person');
    // A person's history is shown only to those who can see that person
    if (personId) await views.person(ctx.actor, personId);
    return { edits: await edits.presentAll(await edits.list(ctx.actor, which, { personId }), ctx.actor) };
  });
  on('GET', '/api/edits/:id', member, async (ctx) => {
    const found = await edits.need(id(ctx));
    if (!edits.canSee(ctx.actor, found)) throw notFound('That edit does not exist.');
    return edits.present(found, ctx.actor);
  });
  on('POST', '/api/edits/:id/review', member, async (ctx) => editResult(ctx.actor, await edits.review(ctx.actor, id(ctx), ctx.body)));
  on('POST', '/api/edits/:id/withdraw', member, (ctx) => edits.withdraw(ctx.actor, id(ctx)));
  on('POST', '/api/edits/:id/revert', member, async (ctx) => editResult(ctx.actor, await edits.revert(ctx.actor, id(ctx))));
  on('POST', '/api/edits/:id/apply', member, async (ctx) => {
    const indexes = Array.isArray(ctx.body.indexes) ? ctx.body.indexes.filter((index): index is number => Number.isInteger(index)) : null;
    return editResult(ctx.actor, await edits.applyDraft(ctx.actor, id(ctx), indexes));
  });
  on('POST', '/api/edits/:id/discard', member, async (ctx) => { await edits.discardDraft(ctx.actor, id(ctx)); return { ok: true }; });
  on('POST', '/api/edits/:id/comments', member, async (ctx) => { await edits.comment(ctx.actor, id(ctx), ctx.body.body); return { ok: true }; });

  on('GET', '/api/notifications', member, async (ctx) => ({ notifications: await edits.notifications(ctx.actor) }));
  on('POST', '/api/notifications/read', member, async (ctx) => { await edits.markRead(ctx.actor); return { ok: true }; });

  on('GET', '/api/compost', admin, (ctx) => ({ people: edits.compost(ctx.actor) }));
  on('POST', '/api/compost/:id/purge', admin, async (ctx) => { await edits.purge(ctx.actor, id(ctx)); return { ok: true }; });

  /* ----- Members, invitations, branches ----- */

  on('GET', '/api/members', member, async (ctx): Promise<MembersInfo> => {
    const everyone = (await members.members()).map((m) => ({ ...m, personName: personName(m.personId, ctx.lang), anchorNames: m.anchors.map((anchor) => personName(anchor, ctx.lang)) }));
    if (!isAdmin(ctx.actor)) {
      // Relatives see who looks after what, and nothing about accounts
      return { members: everyone.map(({ email: _email, ai: _ai, ...rest }) => rest), invites: [], requests: [] };
    }
    return {
      members: everyone,
      invites: (await members.openInvites()).map((found) => ({ id: found.id, email: found.email, role: found.role, personName: personName(found.personId, ctx.lang), by: found.createdBy })),
      requests: (await members.joinRequests()).map((request) => ({ id: request.id, name: request.name, email: request.email, message: request.message, createdAt: request.createdAt })),
    };
  });
  on('POST', '/api/invites', member, async (ctx) => deliverInvite(app, await members.createInvite(ctx.actor, ctx.body as InviteInput), ctx.actor.name, ctx.lang));
  on('DELETE', '/api/invites/:id', admin, async (ctx) => { await members.cancelInvite(id(ctx)); return { ok: true }; });
  on('PATCH', '/api/members/:id', admin, async (ctx) => {
    await members.updateMember(ctx.actor, id(ctx), ctx.body as { role?: Role; personId?: string | null });
    hub.inbox([id(ctx)]);
    return { ok: true };
  });
  on('DELETE', '/api/members/:id', admin, async (ctx) => {
    if (id(ctx) === self(ctx).id) throw badRequest('You cannot remove yourself. Ask another admin.');
    await members.removeMember(ctx.actor, id(ctx));
    return { ok: true };
  });
  on('POST', '/api/members/:id/branches', admin, async (ctx) => {
    await members.addGrant(id(ctx), text(ctx.body.anchor), ctx.actor.name);
    hub.inbox([id(ctx)]);
    return { ok: true };
  });
  on('DELETE', '/api/members/:id/branches/:anchor', admin, async (ctx) => {
    await members.removeGrant(id(ctx), ctx.params.anchor as string);
    hub.inbox([id(ctx)]);
    return { ok: true };
  });
  on('POST', '/api/join/:id', admin, async (ctx) => {
    const created = await members.decideJoin(ctx.actor, id(ctx), ctx.body.approve === true);
    return { invite: created ? await deliverInvite(app, created, ctx.actor.name, ctx.lang) : null };
  });

  /* ----- Health and settings ----- */

  on('GET', '/api/health', member, (ctx) => views.health(ctx.actor));
  on('GET', '/api/settings', admin, (ctx) => adminSettings(store.settings, ctx.lang));
  on('PATCH', '/api/settings', admin, async (ctx) => {
    const patch: Partial<Settings> = {}, words: Record<string, string> = {};
    for (const [key, value] of Object.entries(ctx.body)) {
      if (!(key in SETTING_RULES)) throw HttpError.filled(badRequest, 'There is no setting called "{key}".', { key });
      const setting = key as keyof typeof SETTING_RULES;
      const kept = typeof value === 'string' ? value.trim() : value;
      // The family's words in another language than their own may be left empty: that takes the version away
      const removesVersion = isFamilyField(key) && kept === '' && ctx.lang !== store.settings.familyLang;
      if (!removesVersion && !SETTING_RULES[setting](value)) throw badRequest(SETTING_HINTS[setting] ?? 'That setting cannot take that value.');
      if (isFamilyField(key)) words[key] = String(kept);
      else Object.assign(patch, { [key]: kept });
    }
    // The family's name, line and guidelines are written in the admin's language: changed in their own, or kept beside it in another
    if (Object.keys(words).length) Object.assign(patch, familyPatch(store.settings, words, ctx.lang));
    await store.saveSettings(patch);
    hub.changed(store.seq);     // visibility or the living rule may have changed what people see
    return { ok: true };
  });

  /* ----- Translations ----- */

  on('GET', '/api/translations', admin, (ctx) => translationsOf(store.state, store.settings, ctx.lang));

  /* ----- AI connections ----- */

  on('GET', '/api/connections', member, async (ctx): Promise<ConnectionsInfo> => {
    const own = await members.connections(self(ctx).id);
    if (!isAdmin(ctx.actor)) return { address: `${config.baseUrl}/mcp`, signIn: app.oauth, connections: own, everyone: [] };
    const names = new Map((await members.members()).map((m) => [m.id, m.name]));
    const everyone = (await members.connections()).map((connection) => ({ ...connection, owner: names.get(connection.userId) ?? say(ctx.lang, 'Unknown') }));
    return { address: `${config.baseUrl}/mcp`, signIn: app.oauth, connections: own, everyone };
  });
  on('POST', '/api/connections', member, (ctx) => members.createConnection(self(ctx), ctx.body as ConnectionInput));
  on('PATCH', '/api/connections/:id', member, async (ctx) => { await members.updateConnection(ctx.actor, id(ctx), ctx.body as ConnectionInput); return { ok: true }; });
  on('DELETE', '/api/connections/:id', member, async (ctx) => { await members.revokeConnection(ctx.actor, id(ctx)); return { ok: true }; });

  /* ----- Data in and out ----- */

  const download = (name: string, type: string, body: string): Download => ({ download: { name, type, body } });
  // A GEDCOM file holds one language: the admin's, and each person as first written where it has none
  on('GET', '/api/export/gedcom', admin, (ctx) => download('family.ged', 'text/plain; charset=utf-8', exportGedcom(readingIn(ctx.lang), familyText(store.settings, 'familyName', ctx.lang))));
  on('GET', '/api/export/backup', admin, async () => download('family-backup.json', 'application/json', JSON.stringify(await dump(app.db))));
  on('POST', '/api/import/gedcom', admin, async (ctx) => {
    let parsed: ReturnType<typeof importGedcom>;
    try {
      parsed = importGedcom(text(ctx.body.text));
    } catch (error) {
      throw badRequest(error instanceof Error ? error.message : 'That file could not be read.');
    }
    // Staged, never written directly: the admin previews it on the tree, then applies or discards it
    const result = await edits.submit(ctx.actor, { ops: parsed.ops, message: tell(ctx.lang, 'Import {n} people from a GEDCOM file', { n: parsed.people }), origin: 'import', mode: 'draft' });
    return { ...(await editResult(ctx.actor, result)), people: parsed.people, families: parsed.families, skipped: parsed.skipped };
  });
  on('POST', '/api/import/backup', owner, async (ctx) => {
    await store.exclusive(async () => {
      await restore(app.db, ctx.body.backup);
      await store.load();
    });
    hub.changed(store.seq);
    return { ok: true };
  });

  /* ----- First run, and the demo ----- */

  // After the owner has claimed the install: start with their own leaf
  on('POST', '/api/setup/first-leaf', owner, async (ctx) => {
    if (store.state.people.size) throw badRequest('The tree already has people on it.');
    const given = text(ctx.body.given).trim();
    if (!given) throw badRequest('Enter at least a given name.');
    const born = Number(ctx.body.born);
    const result = await edits.submit(ctx.actor, {
      message: tell(ctx.lang, 'Planted the first leaf'),
      ops: [
        { type: 'person.create', ref: '$me', set: { given, family: text(ctx.body.family).trim(), living: 'yes' } },
        ...(Number.isInteger(born) && born > 0 ? [{ type: 'fact.add', subject: { type: 'person', id: '$me' }, set: { type: 'birth', date: { kind: 'exact', from: String(born) } } }] : []),
      ],
    });
    const leaf = result.created.$me as string;
    await members.updateMember(ctx.actor, self(ctx).id, { personId: leaf });
    await members.addGrant(self(ctx).id, leaf, ctx.actor.name);
    await store.saveSettings({ rootPersonId: leaf });
    hub.changed(store.seq);
    return { personId: leaf };
  });
  on('POST', '/api/demo/reset', owner, async () => {
    if (!config.demoMode) throw notFound();
    await resetDemo(app);
    return { ok: true };
  });

  /* ----- For the host: scheduled work, and a pulse ----- */

  on('POST', '/api/jobs', anyone, async (ctx) => {
    const sent = ctx.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!config.jobsToken || sent !== config.jobsToken) throw forbidden('Scheduled work needs the jobs token.');
    return { ran: await app.scheduler.runDue() };
  });
  on('GET', '/api/healthz', anyone, async () => ({ ok: true, database: await app.databaseAnswers(), email: app.mailer.delivers ? 'configured' : 'not configured', seq: store.seq }));

  /* ----- Answering ----- */

  return async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    // Until the account is known, the language is what the browser says. Errors before that are said in it.
    const asked = { asked: request.headers.get('x-language'), remembered: cookieOf(request.headers.get('cookie'), LANG_COOKIE), device: request.headers.get('accept-language') };
    let lang = chooseLang(asked, store.settings.language);
    try {
      // A page on another site must not be able to act with this visitor's session
      const origin = request.headers.get('origin');
      // The page is this site if it comes from the address the request was sent to, or from the address the tree is known by.
      // The second is for a proxy that passes requests on under a name of its own.
      const hosts = [request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? url.host, new URL(config.baseUrl).host];
      if (request.method !== 'GET' && origin && !hosts.includes(new URL(origin).host)) throw forbidden('Requests from other sites are not accepted.');

      const user = await app.userOf(request);
      if (url.pathname === '/api/stream') return hub.stream(user?.id ?? null, request.signal);

      const route = routes.find((candidate) => candidate.method === request.method && candidate.regex.test(url.pathname));
      const match = route ? url.pathname.match(route.regex) : null;
      if (!route || !match) throw notFound('There is nothing at that address.');
      await store.fresh();
      lang = chooseLang({ ...asked, account: user?.language }, store.settings.language);
      const actor = user ? await members.actorFor(user) : members.visitor();
      const ctx: Context = {
        request, user, body: {}, query: url.searchParams, lang, actor: { ...actor, lang },
        params: Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1] ?? '')])),
      };
      // Who may ask comes before what they sent: something sent to an address its sender may not use is turned away unread
      route.guard(ctx);
      ctx.body = await readBody(request);
      const result = await route.handler(ctx);
      if (result instanceof Response) return result;
      if (result && typeof result === 'object' && 'download' in result) {
        const file = (result as Download).download;
        return new Response(file.body, { headers: { 'Content-Type': file.type, 'Content-Disposition': `attachment; filename="${file.name}"`, 'Cache-Control': 'no-store' } });
      }
      return json(200, result ?? { ok: true });
    } catch (error) {
      // Said in the language of whoever caused it
      if (error instanceof HttpError) return json(error.status, { error: inLanguage(lang, error.phrase ?? error.message, error.values ?? undefined), details: error.details });
      console.error(error);
      return json(500, { error: inLanguage(lang, 'Something went wrong on the server.') });
    }
  };
}
