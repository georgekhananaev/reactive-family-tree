/*
 * Who a member is on the tree. An account is linked to a leaf when it is
 * invited as that person, and an admin can say so afterwards as well: for
 * someone invited before their leaf was there, or linked to the wrong one.
 */

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
