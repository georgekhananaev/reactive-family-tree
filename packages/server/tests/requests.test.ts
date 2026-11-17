/*
 * What every request is asked before it is answered: whether anyone is there
 * to listen, how much it sends, and which site sent it. And what a backup may
 * carry out of the house.
 */

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { account, user } from '@reactive-family-tree/db';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { browser, startDemo } from '../src/testing';
import type { Demo } from '../src/testing';

let demo: Demo;
beforeAll(async () => { demo = await startDemo(); });
afterAll(() => demo.close());

const BASE = 'http://localhost:3000';
/* A request made by hand, for what a browser would not send. */
const send = (path: string, init: RequestInit = {}) =>
  demo.app.handle(new Request(BASE + path, { ...init, headers: { host: new URL(BASE).host, ...(init.headers as Record<string, string> | undefined) } }));

test('a stream is opened only for a browser that is there to listen', async () => {
  // Asked for the headers alone, the answer is sent without anyone reading what follows. So nothing is opened.
  expect((await send('/api/stream', { method: 'HEAD' })).status).toBe(404);
  // A browser that left before its stream began is let go at once, and its stream ends
  expect(await demo.app.hub.stream(null, AbortSignal.abort()).text()).toBe('');

  // One that stays is told it is connected
  const open = await send('/api/stream');
  expect(open.headers.get('content-type')).toContain('text/event-stream');
  const reader = (open.body as ReadableStream<Uint8Array>).getReader();
  expect(new TextDecoder().decode((await reader.read()).value)).toContain('connected');
  await reader.cancel();
});

test('a stranger may send little, a member more, and sign-in next to nothing', async () => {
  const visitor = browser(demo.app, '203.0.113.20');
  const long = (letters: number) => 'x'.repeat(letters);
  expect((await visitor.post('/api/join', { name: 'A', email: 'a@example.com', message: long(300 * 1024) })).status, 'no stranger has that much to say').toBe(413);
  expect((await visitor.post('/api/join', { name: 'A', email: 'a@example.com', message: 'Hello' })).status).toBe(200);

  // Sign-in is an address, a passkey's answer or a client's few lines about itself
  const padded = await visitor.post('/api/auth/sign-in/magic-link', { email: 'a@example.com', callbackURL: '/', padding: long(100 * 1024) });
  expect([padded.status, padded.data.message]).toEqual([413, 'That is too large to send.']);
  expect((await visitor.post('/api/auth/sign-in/magic-link', { email: 'a@example.com', callbackURL: '/' })).status, 'and what it is meant for still goes through').toBe(200);

  // A member's import is far larger than anything a stranger may send
  const helen = browser(demo.app);
  expect((await helen.signInAs('helen')).status).toBe(200);
  const file = `0 HEAD\n${'1 NOTE a line of nothing\n'.repeat(20000)}0 TRLR\n`;
  expect(file.length).toBeGreaterThan(300 * 1024);
  expect((await helen.post('/api/import/gedcom', { text: file })).status, 'read, and found to hold nobody').not.toBe(413);
});

test('a page that is not this site is refused, however it says where it comes from', async () => {
  for (const origin of ['null', 'https://elsewhere.example', 'not an address at all']) {
    const answer = await send('/api/join', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
    expect(answer.status, origin).toBe(403);
  }
  expect((await send('/api/people/%E0%A4%A')).status, 'an address that is not written the way addresses are').toBe(404);
});

test('a backup carries no keys to anywhere else, and a restore keeps what it replaces', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  // Someone signed in with Google once, and what Google handed over was kept with their account
  const [member] = await demo.app.db.select({ id: user.id }).from(user).limit(1);
  await demo.app.db.insert(account).values({
    id: 'acc_test', accountId: 'google-1', providerId: 'google', userId: (member as { id: string }).id,
    accessToken: 'an-access-token', refreshToken: 'a-refresh-token', idToken: 'an-id-token', createdAt: new Date(), updatedAt: new Date(),
  });

  const backup = (await helen.get('/api/export/backup')).data;
  const kept = backup.tables.account.find((row: { id: string }) => row.id === 'acc_test');
  expect([kept.providerId, kept.accessToken, kept.refreshToken, kept.idToken], 'the account is in it, its keys are not').toEqual(['google', null, null, null]);
  expect(JSON.stringify(backup)).not.toMatch(/an-access-token|a-refresh-token|an-id-token/);

  // Before a backup replaces the family, the family as it stood is written beside the database
  const folder = join(dirname(demo.app.config.databaseUrl.slice('file:'.length)), 'snapshots');
  expect((await helen.post('/api/import/backup', { backup })).status).toBe(200);
  const copies = readdirSync(folder);
  expect(copies.filter((file) => /^before-restore-[\dT-]+\.json$/.test(file)).length).toBe(1);
  expect(copies.some((file) => file.endsWith('.part')), 'nothing half written is left').toBe(false);
});
