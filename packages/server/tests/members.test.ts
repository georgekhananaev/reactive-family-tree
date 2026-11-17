/*
 * Who a member is on the tree. An account is linked to a leaf when it is
 * invited as that person, and an admin can say so afterwards as well: for
 * someone invited before their leaf was there, or linked to the wrong one.
 */

import { session, user } from '@reactive-family-tree/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, expect, test } from 'vitest';

import { browser, startDemo } from '../src/testing';
import type { Demo } from '../src/testing';

let demo: Demo;
beforeAll(async () => { demo = await startDemo(); });
afterAll(() => demo.close());

test('an admin links an account to a leaf afterwards, changes it, and takes it away', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const daniel = browser(demo.app);
  await daniel.signInAs('daniel');
  const listed = async (name: string): Promise<{ id: string; personId: string | null; personName: string | null }> =>
    (await helen.get('/api/members')).data.members.find((member: { name: string }) => member.name === name);
  const { id } = await listed('Daniel Okafor');
  const link = (personId: string | null) => helen.patch(`/api/members/${id}`, { personId });

  // Taken away: he is a member with no leaf of his own
  expect((await link(null)).status).toBe(200);
  expect((await listed('Daniel Okafor')).personId).toBeNull();
  expect((await daniel.get('/api/session')).data.user.personId, 'and his own page knows it').toBeNull();

  // Linked to a leaf, and then to another
  expect((await link(demo.idOf('Walter'))).status).toBe(200);
  expect((await listed('Daniel Okafor')).personName).toBe('Walter Marlow');
  expect((await link(demo.idOf('Daniel'))).status).toBe(200);
  expect((await daniel.get('/api/session')).data.user.personId).toBe(demo.idOf('Daniel'));

  // Never to a leaf that is someone else's, nor to one that is not there
  const taken = await link(demo.idOf('Helen'));
  expect([taken.status, taken.data.error]).toEqual([400, 'Another member is already linked to that person.']);
  expect((await link('p_nobody')).data.error).toBe('That person is not on the tree.');
  expect((await listed('Daniel Okafor')).personId, 'and he stays who he was').toBe(demo.idOf('Daniel'));

  // Only an admin says who is who
  const sophie = browser(demo.app);
  await sophie.signInAs('sophie');
  expect((await sophie.patch(`/api/members/${id}`, { personId: null })).status).toBe(403);
});

test('the name on an account is the one it was given, and a member cannot write another over it', async () => {
  const sophie = browser(demo.app);
  await sophie.signInAs('sophie');
  const { name } = (await sophie.get('/api/session')).data.user;
  // What a member suggests, writes and invites is signed with this name. The sign-in library would let them change it.
  expect((await sophie.post('/api/auth/update-user', { name: 'Helen Marlow' })).status).toBe(404);
  expect((await sophie.get('/api/session')).data.user.name).toBe(name);
});

test('a session lasts as long as it was said to: a passkey can be added on any day of it, and using it does not make it longer', async () => {
  const daniel = browser(demo.app);
  await daniel.signInAs('daniel');
  const { id } = (await daniel.get('/api/session')).data.user;
  const DAY = 86_400_000;
  // Signed in ten days ago, with twenty days to go
  const ends = new Date(Date.now() + 20 * DAY);
  await demo.app.db.update(session).set({ createdAt: new Date(Date.now() - 10 * DAY), updatedAt: new Date(Date.now() - 10 * DAY), expiresAt: ends }).where(eq(session.userId, id));

  expect((await daniel.get('/api/auth/passkey/generate-register-options')).status, 'not only on the day of signing in').toBe(200);
  expect((await daniel.get('/api/session')).data.user.id, 'still signed in').toBe(id);
  const [kept] = await demo.app.db.select({ expiresAt: session.expiresAt }).from(session).where(eq(session.userId, id));
  expect(kept?.expiresAt.getTime(), 'and it still ends on the day it was to end').toBe(ends.getTime());
});

test('one invitation makes one account, even when two people open it at the same moment', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const invited = async (personId: string | null) => new URL((await helen.post('/api/invites', { personId, role: 'member', grantBranch: true })).data.link).searchParams.get('invite');
  const accounts = async () => (await demo.app.db.select({ email: user.email, personId: user.personId }).from(user)).filter((row) => row.email.endsWith('@twice.example'));

  const token = await invited(demo.idOf('Walter'));
  const answers = await Promise.all(['first', 'second', 'third'].map((who) => browser(demo.app).post('/api/auth/family/accept-invite', { token, name: `The ${who}`, email: `${who}@twice.example` })));
  expect(answers.map((answer) => answer.status).sort(), 'one is let in, the others are told it was used').toEqual([200, 400, 400]);
  expect((await accounts()).map((row) => row.personId)).toEqual([demo.idOf('Walter')]);

  // An invitation that could not be taken up, for an address that has an account already, is still good for its owner
  const again = await invited(null);
  expect((await browser(demo.app).post('/api/auth/family/accept-invite', { token: again, name: 'A copy', email: 'first@twice.example' })).status).toBe(400);
  expect((await browser(demo.app).post('/api/auth/family/accept-invite', { token: again, name: 'The fourth', email: 'fourth@twice.example' })).status).toBe(200);
});

test('a member whose leaf is kept private is not named by it to other relatives', async () => {
  const helen = browser(demo.app), sophie = browser(demo.app);
  await helen.signInAs('helen');
  await sophie.signInAs('sophie');
  const daniel = demo.idOf('Daniel');
  const row = async (who: typeof helen): Promise<{ personId: string | null; personName: string | null; anchors: string[]; anchorNames: string[] }> =>
    (await who.get('/api/members')).data.members.find((member: { name: string }) => member.name === 'Daniel Okafor');
  expect((await row(sophie)).personId, 'while he is open, his cousins see which leaf is his').toBe(daniel);

  expect((await helen.edit([{ type: 'person.update', person: daniel, set: { privacy: 'private' } }])).data.status).toBe('applied');
  const theirs = await row(sophie);
  expect([theirs.personId, theirs.personName, theirs.anchors.includes(daniel), theirs.anchorNames.includes('Daniel Okafor')]).toEqual([null, null, false, false]);
  expect(JSON.stringify(theirs), 'his id is not in it anywhere').not.toContain(daniel);
  expect((await row(helen)).personId, 'an admin still reads who is who').toBe(daniel);
  await helen.edit([{ type: 'person.update', person: daniel, set: { privacy: 'default' } }]);
});
