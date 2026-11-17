/*
 * The whole backend as one object: the database, the family in memory, the
 * services, sign-in, the web API and the scheduled work. A web framework only
 * has to pass requests in.
 */

import { dirname, join } from 'node:path';

import type { Actor } from '@reactive-family-tree/core';
import { meta, migrate, openDatabase } from '@reactive-family-tree/db';
import type { Database } from '@reactive-family-tree/db';
import { eq, sql } from 'drizzle-orm';

import { createApi } from './api';
import { createAuth, oauthPossible, verifyAiSignIn } from './auth';
import type { Auth, FamilySignIn } from './auth';
import { writeSnapshot } from './backup';
import type { AppConfig } from './config';
import { createDoor } from './door';
import type { Door } from './door';
import { Edits } from './edits';
import { createMailer } from './email';
import type { Mailer } from './email';
import { HttpError, forbidden, notFound } from './errors';
import { hashToken, newToken } from './ids';
import { Scheduler } from './jobs';
import type { Job } from './jobs';
import { Media, createMediaStore } from './media';
import { Members } from './members';
import type { ActiveConnection, UserRow } from './members';
import { Hub } from './realtime';
import { measured } from './request';
import { seedDemo } from './seed';
import { familyText } from './settings';
import { FamilyStore } from './store';
import { Views } from './views';

const AUTH_SECRET = 'auth_secret';
const SETUP_TOKEN = 'setup_token_hash';
const SETUP_TOKEN_LENGTH = 20;   // the shortest setup token an install will take from its settings
/* The most that may be sent to sign-in. An address, a passkey's answer or an AI client's description of itself is a few thousand letters. */
const MAX_SIGN_IN_BODY = 64 * 1024;

export interface App {
  config: AppConfig;
  db: Database;
  store: FamilyStore;
  hub: Hub;
  members: Members;
  edits: Edits;
  views: Views;
  media: Media;
  mailer: Mailer;
  /* What guards the things a stranger may ask for. */
  door: Door;
  auth: Auth;
  scheduler: Scheduler;
  /* Whether an AI client can connect by signing in. It needs HTTPS, or a loopback address. */
  oauth: boolean;
  /* The web API: everything under /api except sign-in itself. */
  handle(request: Request): Promise<Response>;
  /* Sign-in itself: everything under /api/auth, answered by the sign-in library. */
  signIn(request: Request): Promise<Response>;
  /* Keep a copy of everything as it stands, beside the database, before something replaces it. Nothing where the database is not a file. */
  keepCopy(): Promise<void>;
  /* The account a request is signed in as. */
  userOf(request: Request): Promise<UserRow | null>;
  /*
   * Who an AI client's request comes from: the member it acts for and the
   * connection it comes through. When it may not come in, the response to send
   * instead, which tells a client that can sign in where to do so.
   */
  aiCaller(request: Request): Promise<AiCaller | Response>;
  /* A fresh install that nobody has claimed yet. */
  needsSetup(): Promise<boolean>;
  /* The last sign-in link sent to an address, handed over once. Demo installs show it on screen. */
  takeLink(email: string): string | null;
  databaseAnswers(): Promise<boolean>;
}

export interface AiCaller {
  actor: Actor;
  connection: ActiveConnection;
}

const refused = (message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error: message }), { status: 401, headers: { 'Content-Type': 'application/json', ...headers } });

async function readMeta(db: Database, key: string): Promise<string | null> {
  const [row] = await db.select().from(meta).where(eq(meta.key, key));
  return row?.value ?? null;
}

async function writeMeta(db: Database, key: string, value: string): Promise<void> {
  await db.insert(meta).values({ key, value }).onConflictDoUpdate({ target: meta.key, set: { value: sql`excluded.value` } });
}

/* The secret that signs sessions: given from outside, or made once and kept. */
async function secretFor(db: Database, config: AppConfig): Promise<string> {
  if (config.secret) return config.secret;
  const kept = await readMeta(db, AUTH_SECRET);
  if (kept) return kept;
  const made = newToken('');
  await writeMeta(db, AUTH_SECRET, made);
  return made;
}

export async function createApp(config: AppConfig): Promise<App> {
  const db = openDatabase({ url: config.databaseUrl, authToken: config.databaseAuthToken });
  await migrate(db);
  const store = new FamilyStore(db);
  await store.load();
  const hub = new Hub();
  const members = new Members(db, store);
  const media = new Media(db, createMediaStore(config), store);
  const edits = new Edits(db, store, members, hub, media);
  const views = new Views(store, edits, members);
  const mailer = createMailer(config.email);
  const door = createDoor(config);
  const links = new Map<string, string>();

  let claimed = false;
  const needsSetup = async () => {
    if (claimed || config.demoMode) return false;
    claimed = !(await store.isEmpty());
    return !claimed;
  };

  const family: FamilySignIn = {
    familyName: (lang) => familyText(store.settings, 'familyName', lang),
    languageFor: async (email) => (await members.languageOf(email)) ?? store.settings.language,
    language: () => store.settings.language,
    hasAccount: async (email) => Boolean(await members.userByEmail(email)),
    async demoAccount(email) {
      await store.fresh();
      const listed = config.demoMode && store.settings.demoAccounts.some((account) => account.email === email);
      const found = listed ? await members.userByEmail(email) : null;
      if (!found) throw notFound('That demo account does not exist.');
      return found.id;
    },
    async acceptInvite(input) {
      await store.fresh();
      const created = await members.acceptInvite(input.token, input);
      hub.changed(store.seq);
      return created.id;
    },
    // Only the one-time link from the server log (or the SETUP_TOKEN given to the host) opens a fresh install
    async claimSetup({ token, name, email }) {
      const expected = await readMeta(db, SETUP_TOKEN);
      if (!(await needsSetup()) || !expected || hashToken(token) !== expected) throw forbidden('That setup link is not valid, or the tree has already been set up.');
      if (!name.trim() || !email.includes('@')) throw forbidden('Enter your name and your email address.');
      const created = await members.createUser({ name: name.trim(), email, role: 'owner', personId: null });
      await db.delete(meta).where(eq(meta.key, SETUP_TOKEN));
      claimed = true;
      return created.id;
    },
  };

  const auth = createAuth({
    db, config, secret: await secretFor(db, config), mailer, door, family,
    // Sign-in links are kept to show on the page only for the made-up family. A real family's are mailed and kept nowhere.
    onLink: config.demoMode ? (email, url) => links.set(email.toLowerCase(), url) : undefined,
  });

  const jobs: Job[] = [
    { name: 'compost', everyHours: 24, run: async () => `${await edits.sweepCompost()} removed for good` },
    { name: 'photos', everyHours: 24, run: async () => `${await media.sweep()} unused photos removed` },
  ];
  // The nightly snapshot is written beside the database, so it is offered when the database is a file
  const snapshots = config.databaseUrl.startsWith('file:') ? join(dirname(config.databaseUrl.slice('file:'.length)), 'snapshots') : null;
  if (snapshots) jobs.push({ name: 'snapshot', everyHours: 24, run: () => writeSnapshot(db, snapshots) });
  const scheduler = new Scheduler(db, jobs);

  const app: App = {
    config, db, store, hub, members, edits, views, media, mailer, door, auth, scheduler,
    oauth: oauthPossible(config.baseUrl),
    handle: (request) => handle(request),
    async signIn(request) {
      // The library reads whatever it is sent, whole, before it asks who sent it. So what is sent is measured first.
      try {
        return await auth.handler(await measured(request, MAX_SIGN_IN_BODY));
      } catch (error) {
        if (!(error instanceof HttpError)) throw error;
        return new Response(JSON.stringify({ message: error.message }), { status: error.status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
    },
    async keepCopy() {
      if (snapshots) await writeSnapshot(db, snapshots, 'before-restore');
    },
    async userOf(request) {
      const session = await auth.api.getSession({ headers: request.headers });
      return session ? members.user(session.user.id) : null;
    },
    async aiCaller(request) {
      await store.fresh();
      const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1] ?? null;
      let found: Awaited<ReturnType<Members['connectionForToken']>> = null;
      if (token?.startsWith('rft_')) {
        found = await members.connectionForToken(token);
      } else if (app.oauth) {
        const claims = await verifyAiSignIn(auth, `${config.baseUrl}/mcp`, request);
        if (claims instanceof Response) return claims;
        const client = String(claims.azp ?? claims.client_id ?? '');
        found = claims.sub && client ? await members.connectionForClient(claims.sub, client) : null;
      }
      if (!found) return refused('Send the token from "Connect your AI" as a bearer token.', { 'WWW-Authenticate': 'Bearer realm="family-tree"' });
      return { connection: found.connection, actor: await members.actorFor(found.user) };
    },
    needsSetup,
    takeLink(email) {
      const key = email.trim().toLowerCase();
      const link = links.get(key) ?? null;
      links.delete(key);
      return link;
    },
    async databaseAnswers() {
      try {
        await db.$client.execute('SELECT 1');
        return true;
      } catch {
        return false;
      }
    },
  };
  const handle = createApi(app);

  if (config.demoMode && (await store.isEmpty())) {
    await seedDemo(app);
    console.log(`Planted the demo family. Try it at ${config.baseUrl}`);
  } else if (await needsSetup()) {
    // A token that is empty or short is one a stranger could guess, and whoever holds it becomes the owner. Then a fresh one is made instead.
    const given = config.setupToken?.trim() ?? '';
    if (given && given.length < SETUP_TOKEN_LENGTH) console.warn(`SETUP_TOKEN is shorter than ${SETUP_TOKEN_LENGTH} characters, so it was not used.`);
    const token = given.length >= SETUP_TOKEN_LENGTH ? given : newToken('setup_');
    await writeMeta(db, SETUP_TOKEN, hashToken(token));
    console.log(`\nThis family tree has not been set up yet. Open this link to claim it:\n\n  ${config.baseUrl}/setup?token=${token}\n`);
  }
  if (config.timers) scheduler.start();
  return app;
}
