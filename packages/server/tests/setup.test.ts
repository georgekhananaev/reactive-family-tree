/*
 * A fresh install: nobody can do anything until the one person holding the
 * setup link claims it, and that link opens the door exactly once.
 */

import { afterAll, beforeAll, expect, test } from 'vitest';

import { browser, startFresh } from '../src/testing';
import type { Started } from '../src/testing';

const TOKEN = 'setup_only-for-this-test';

let fresh: Started;
beforeAll(async () => { fresh = await startFresh(TOKEN); });
afterAll(() => fresh.close());

test('a fresh install is claimed once, by whoever holds the setup link', async () => {
  const visitor = browser(fresh.app);
  const before = (await visitor.get('/api/session')).data;
  expect(before.needsSetup, 'the app says it is waiting to be set up').toBe(true);
  expect(before.demo).toBe(false);
  expect(before.demoAccounts).toEqual([]);

  const owner = { name: 'Ana Reyes', email: 'ana@reyes.example' };
  expect((await visitor.post('/api/auth/family/claim-setup', { token: 'setup_a-guess', ...owner })).status, 'a guessed link opens nothing').toBe(403);
  expect((await visitor.post('/api/auth/family/claim-setup', { token: TOKEN, name: '', email: owner.email })).status, 'the owner needs a name').toBe(403);
  expect((await visitor.post('/api/setup/first-leaf', { given: 'Ana' })).status, 'nobody plants a leaf before signing in').toBe(401);

  const ana = browser(fresh.app);
  expect((await ana.post('/api/auth/family/claim-setup', { token: TOKEN, ...owner })).status).toBe(200);
  const session = (await ana.get('/api/session')).data;
  expect(session.user.role).toBe('owner');
  expect(session.user.hasPasskey, 'the page knows a sign-out now would leave only the link in the log').toBe(false);
  expect(session.signIn.emailWorks).toBe(false);
  expect(session.needsSetup, 'claimed, so the setup link is spent').toBe(false);
  expect((await browser(fresh.app).post('/api/auth/family/claim-setup', { token: TOKEN, name: 'Mallory', email: 'm@example.com' })).status, 'the link works once').toBe(403);

  // A setting that is turned down says why in plain words
  const unnamed = await ana.patch('/api/settings', { familyName: '  ' });
  expect(unnamed.status).toBe(400);
  expect(unnamed.data.error).toBe('Give the tree a name, up to 80 letters.');
  expect((await ana.patch('/api/settings', { familyName: 'Reyes family' })).status).toBe(200);
  expect((await ana.post('/api/setup/demo-family')).status, 'a real tree is never offered the made-up family').toBe(404);

  // The owner plants the first leaf: themselves
  expect((await ana.post('/api/setup/first-leaf', { given: '' })).status).toBe(400);
  const leaf = (await ana.post('/api/setup/first-leaf', { given: 'Ana', family: 'Reyes', born: 1980 })).data.personId as string;
  const tree = (await ana.get('/api/tree')).data;
  expect(tree.people.map((p: { given: string }) => p.given)).toEqual(['Ana']);
  expect(tree.rootId, 'the tree grows from the first leaf').toBe(leaf);
  const me = (await ana.get('/api/session')).data.user;
  expect(me.personId, 'the owner is that leaf').toBe(leaf);
  expect(me.anchors, 'and looks after the branch that grows from it').toEqual([leaf]);
  expect((await ana.post('/api/setup/first-leaf', { given: 'Again' })).status, 'only an empty tree is started this way').toBe(400);

  // From here it is an ordinary tree: the owner adds a child
  const added = (await ana.edit([{ type: 'person.create', ref: '$kid', set: { given: 'Leo', family: 'Reyes', living: 'yes' } }])).data;
  expect(added.status).toBe('applied');

  // A real family is never wiped as a demo, even on an install that was told by mistake that it is one
  fresh.app.config.demoMode = true;
  expect((await ana.post('/api/demo/reset')).status, 'there is no demo here to start again').toBe(404);
  fresh.app.config.demoMode = false;
  expect((await ana.get('/api/tree')).data.people.map((p: { given: string }) => p.given).sort(), 'the family is as it was').toEqual(['Ana', 'Leo']);
});

test('a tree that is new is private until its owner decides otherwise', async () => {
  const { data: tree } = await browser(fresh.app).get('/api/tree');
  expect(tree.closed, 'a stranger is told the tree is closed').toBe(true);
  expect(tree.people.length, 'and sees nobody').toBe(0);
});

test('a setup token that could be guessed is not taken', async () => {
  // SETUP_TOKEN left empty, or set to a word: whoever knew it would become the owner
  for (const weak of ['', '   ', 'family']) {
    const loose = await startFresh(weak);
    const claim = await browser(loose.app).post('/api/auth/family/claim-setup', { token: weak, name: 'Mallory', email: 'm@example.com' });
    expect(claim.status, `"${weak}" opens nothing`).toBe(403);
    expect((await browser(loose.app).get('/api/session')).data.needsSetup, 'and the install still waits for the real link').toBe(true);
    await loose.close();
  }
});

