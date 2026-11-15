/*
 * The door: what guards the three things a stranger may ask of a family tree
 * without an account. A sign-in link, a request to join and a suggestion are
 * each limited, and where Cloudflare's check is set up nobody gets through
 * without its proof. Cloudflare itself is not asked in these tests: a stand-in
 * answers for it.
 */

import { PROOF_HEADER } from '@reactive-family-tree/core';
import type { Op } from '@reactive-family-tree/core';
import { afterEach, expect, test, vi } from 'vitest';

import { createDoor } from '../src/door';
import { browser, startDemo } from '../src/testing';

const KEYS = { siteKey: 'the-site-key', secretKey: 'the-secret-key' };
const from = (sender: string, proof?: string) => new Headers({ 'x-forwarded-for': sender, ...(proof && { [PROOF_HEADER]: proof }) });
const status = (knocking: Promise<void>): Promise<number> => knocking.then(() => 200, (error: { status: number }) => error.status);

/* Cloudflare, as these tests need it: it accepts the proof "a person" and nothing else. What it was asked is kept. */
function cloudflare() {
  const asked: URLSearchParams[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_address: string, sent: { body: URLSearchParams }) => {
    asked.push(sent.body);
    return Response.json({ success: sent.body.get('response') === 'a person' });
  }));
  return asked;
}
afterEach(() => vi.unstubAllGlobals());

test('one sender may knock a few times an hour, and each thing asked for is counted by itself', async () => {
  const door = createDoor({});
  const answers: number[] = [];
  for (let knock = 0; knock < 7; knock++) answers.push(await status(door.admit('join', from('203.0.113.7'))));
  expect(answers).toEqual([200, 200, 200, 200, 200, 429, 429]);
  // Having asked to join too often does not stop the same sender asking for a sign-in link
  expect(await status(door.admit('link', from('203.0.113.7')))).toBe(200);
  // Nor does it stop anyone else
  expect(await status(door.admit('join', from('203.0.113.8')))).toBe(200);
  // It is the nearest proxy that is believed, whatever the sender wrote in front of it
  expect(await status(door.admit('join', from('10.1.1.1, 203.0.113.7')))).toBe(429);
  // A sender nothing is known about is not counted with every other such sender
  for (let knock = 0; knock < 40; knock++) expect(await status(door.admit('join', new Headers()))).toBe(200);
});

test('one address is sent a few sign-in letters an hour, and no more', () => {
  const door = createDoor({});
  expect([1, 2, 3, 4, 5].map(() => door.mayWrite('nora@marlow.example'))).toEqual([true, true, true, false, false]);
  expect(door.mayWrite('helen@marlow.example'), 'another address is counted by itself').toBe(true);
});

test('with no check set up, the page is told so and nothing is asked of Cloudflare', async () => {
  const asked = cloudflare();
  const door = createDoor({});
  expect(door.siteKey).toBeNull();
  expect(await status(door.admit('link', from('203.0.113.9')))).toBe(200);
  expect(asked).toEqual([]);
});

test('with the check set up, nobody comes in without proof that Cloudflare accepts', async () => {
  const asked = cloudflare();
  const door = createDoor({ humanCheck: KEYS });
  expect(door.siteKey).toBe(KEYS.siteKey);
  expect(await status(door.admit('link', from('203.0.113.9'))), 'no proof at all').toBe(403);
  expect(asked, 'Cloudflare is not troubled with nothing').toEqual([]);
  expect(await status(door.admit('link', from('203.0.113.9', 'a robot'))), 'proof that Cloudflare turns down').toBe(403);
  expect(await status(door.admit('link', from('203.0.113.9', 'a person')))).toBe(200);
  // Cloudflare is given the secret, the proof, and where the sender is
  expect(Object.fromEntries(asked.at(-1) ?? [])).toEqual({ secret: KEYS.secretKey, response: 'a person', remoteip: '203.0.113.9' });
});

test('when Cloudflare cannot be asked, people are let through and the limits still hold', async () => {
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network'); }));
  const door = createDoor({ humanCheck: KEYS });
  const answers: number[] = [];
  for (let knock = 0; knock < 7; knock++) answers.push(await status(door.admit('join', from('203.0.113.10', 'a person'))));
  expect(answers).toEqual([200, 200, 200, 200, 200, 429, 429]);
  expect(said, 'and it is written in the server log').toHaveBeenCalled();
  // An answer that is not an answer counts as no answer
  vi.stubGlobal('fetch', vi.fn(async () => new Response('down for maintenance', { status: 503 })));
  expect(await status(door.admit('link', from('203.0.113.10', 'a person')))).toBe(200);
  // Without any proof nobody is let through, whatever state Cloudflare is in
  expect(await status(door.admit('link', from('203.0.113.11')))).toBe(403);
  said.mockRestore();
});

test('in a running tree the link, the request to join and the suggestion all go by the door', async () => {
  cloudflare();
  const demo = await startDemo(KEYS);
  try {
    expect((await browser(demo.app).get('/api/session')).data.humanCheck, 'the page is told the key to show the check with').toBe(KEYS.siteKey);
    const letters = vi.spyOn(demo.app.mailer, 'send').mockResolvedValue();
    const rosalind: Op[] = [{ type: 'person.update', person: demo.idOf('Rosalind'), set: { given: 'Rosalinde' } }];
    const asks = {
      link: (who: ReturnType<typeof browser>) => who.post('/api/auth/sign-in/magic-link', { email: 'nora@marlow.example', callbackURL: '/' }),
      join: (who: ReturnType<typeof browser>) => who.post('/api/join', { name: 'A cousin', email: 'cousin@example.com' }),
      suggest: (who: ReturnType<typeof browser>) => who.edit(rosalind, { mode: 'suggest', contact: { name: 'A cousin', email: 'cousin@example.com' } }),
    };
    for (const [what, ask] of Object.entries(asks)) {
      const stranger = browser(demo.app, '203.0.113.20');
      const turnedAway = await ask(stranger);
      expect(turnedAway.status, `${what}, with no proof`).toBe(403);
      // The sign-in library says its refusals under "message", the web API under "error"
      expect(turnedAway.data.message ?? turnedAway.data.error, what).toBe('The check that you are a person did not pass. Try again.');
      stranger.proves('a robot');
      expect((await ask(stranger)).status, `${what}, with proof Cloudflare turns down`).toBe(403);
      stranger.proves('a person');
      expect((await ask(stranger)).status, `${what}, with proof`).toBe(200);
    }
    expect(letters, 'only the proven request for a link sent a letter').toHaveBeenCalledTimes(1);

    // A refusal is said in the language the page asked for
    const reader = browser(demo.app, '203.0.113.21');
    reader.reads('he');
    expect((await asks.link(reader)).data.message).toMatch(/[֐-׿]/);

    // Someone signed in is not a stranger: their edits need no proof
    const helen = browser(demo.app, '203.0.113.22');
    await helen.signInAs('helen');
    expect((await helen.edit(rosalind)).status).toBe(200);

    // One address is not written to over and over, and the page is told the same either way
    const eager = browser(demo.app, '203.0.113.23');
    eager.proves('a person');
    for (let asked = 0; asked < 4; asked++) expect((await asks.link(eager)).status).toBe(200);
    expect(letters, 'three letters an hour to one address, counting the one above').toHaveBeenCalledTimes(3);
  } finally {
    demo.close();
  }
});
