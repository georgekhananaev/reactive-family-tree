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
/* The two proofs the stand-in for Cloudflare tells apart. */
const PERSON = 'a-person', ROBOT = 'a-robot';
const HOUR = 3_600_000;
const from = (sender: string, proof?: string) => new Headers({ 'x-forwarded-for': sender, ...(proof && { [PROOF_HEADER]: proof }) });
const status = (knocking: Promise<void>): Promise<number> => knocking.then(() => 200, (error: { status: number }) => error.status);
const all = (times: number, answer: number): number[] => Array<number>(times).fill(answer);

/* What the same thing was answered, asked several times one after another. */
async function inTurn<T>(times: number, ask: (nth: number) => Promise<T>): Promise<T[]> {
  const heard: T[] = [];
  for (let nth = 0; nth < times; nth++) heard.push(await ask(nth));
  return heard;
}
const answers = (times: number, knock: (nth: number) => Promise<void>): Promise<number[]> => inTurn(times, (nth) => status(knock(nth)));

/* Cloudflare, as these tests need it: it accepts the proof of a person and nothing else. What it was asked is kept. */
function cloudflare() {
  const asked: URLSearchParams[] = [];
  vi.stubGlobal('fetch', vi.fn(async (_address: string, sent: { body: URLSearchParams }) => {
    asked.push(sent.body);
    return Response.json({ success: sent.body.get('response') === PERSON });
  }));
  return asked;
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

test('one sender may knock a few times an hour, and each thing asked for is counted by itself', async () => {
  const door = createDoor({});
  expect(await answers(7, () => door.admit('join', from('203.0.113.7')))).toEqual([...all(5, 200), 429, 429]);
  // Having asked to join too often does not stop the same sender asking for a sign-in link
  expect(await status(door.admit('link', from('203.0.113.7')))).toBe(200);
  // Nor does it stop anyone else
  expect(await status(door.admit('join', from('203.0.113.8')))).toBe(200);
  // It is the nearest proxy that is believed, whatever the sender wrote in front of it
  expect(await status(door.admit('join', from('10.1.1.1, 203.0.113.7')))).toBe(429);
  // A sender nothing is known about is not counted with every other such sender
  expect(await answers(40, () => door.admit('join', new Headers()))).toEqual(all(40, 200));
});

test('sign-in letters are counted for each sender that asks, so nobody can use up the tries of someone else', async () => {
  const door = createDoor({});
  const asks = (sender: string, address: string) => door.admit('link', from(sender), address);
  expect(await answers(4, () => asks('203.0.113.30', 'nora@marlow.example')), 'three an hour from one sender').toEqual([...all(3, 200), 429]);
  expect(await status(asks('203.0.113.30', ' Nora@Marlow.example ')), 'however the address is written').toBe(429);
  expect(await status(asks('203.0.113.30', 'helen@marlow.example')), 'another address is counted by itself').toBe(200);
  // The one whose address it is asks from somewhere else, and is still let through
  expect(await answers(3, () => asks('203.0.113.31', 'nora@marlow.example'))).toEqual(all(3, 200));
  // Six an hour for one address is all there is, wherever they are asked from. What was turned away above was not counted.
  expect(await status(asks('203.0.113.32', 'nora@marlow.example'))).toBe(429);
  // A sender nothing is known about has only the count for everyone
  expect(await answers(7, () => door.admit('link', new Headers(), 'rosalind@marlow.example'))).toEqual([...all(6, 200), 429]);
});

test('the hour and the day are counted apart, and asking for other addresses does not have one forgotten', async () => {
  vi.useFakeTimers();
  const door = createDoor({});
  const asks = (address: string) => door.admit('link', new Headers(), address);
  // Six in one hour and six in the next: the twelve of a day
  expect(await answers(7, () => asks('nora@marlow.example'))).toEqual([...all(6, 200), 429]);
  vi.advanceTimersByTime(HOUR + 1);
  expect(await answers(7, () => asks('nora@marlow.example'))).toEqual([...all(6, 200), 429]);
  vi.advanceTimersByTime(HOUR + 1);
  // More other addresses than the count of an hour remembers
  expect(await answers(600, (nth) => asks(`someone${nth}@example.com`))).toEqual(all(600, 200));
  expect(await status(asks('nora@marlow.example')), 'the day still knows her twelve').toBe(429);
  // The day after, it all starts afresh
  vi.advanceTimersByTime(24 * HOUR);
  expect(await status(asks('nora@marlow.example'))).toBe(200);
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
  expect(await status(door.admit('link', from('203.0.113.9', 'x'.repeat(2049)))), 'longer than any proof Cloudflare gives').toBe(403);
  expect(await status(door.admit('link', from('203.0.113.9', 'made up, in pieces'))), 'not written the way a proof is').toBe(403);
  expect(asked, 'Cloudflare is not troubled with any of these').toEqual([]);
  expect(await status(door.admit('link', from('203.0.113.9', ROBOT))), 'proof that Cloudflare turns down').toBe(403);
  expect(await status(door.admit('link', from('203.0.113.9', PERSON)))).toBe(200);
  // Cloudflare is given the secret, the proof, and where the sender is
  expect(Object.fromEntries(asked.at(-1) ?? [])).toEqual({ secret: KEYS.secretKey, response: PERSON, remoteip: '203.0.113.9' });
  // Whoever is turned away here has not used up a letter of the address they asked for
  expect(await answers(8, () => door.admit('link', from('203.0.113.13', ROBOT), 'nora@marlow.example'))).toEqual(all(8, 403));
  expect(await status(door.admit('link', from('203.0.113.13', PERSON), 'nora@marlow.example'))).toBe(200);
});

test('when Cloudflare cannot be reached, a few an hour are let through and after them nobody', async () => {
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network'); }));
  const door = createDoor({ humanCheck: KEYS });
  // The limits hold for those let through
  expect(await answers(7, () => door.admit('join', from('203.0.113.10', PERSON)))).toEqual([...all(5, 200), 429, 429]);
  expect(said, 'and it is written in the server log').toHaveBeenCalled();
  // Twenty an hour is all, wherever they come from: those five and fifteen more
  expect(await answers(17, (nth) => door.admit('join', from(`203.0.113.${100 + nth}`, PERSON)))).toEqual([...all(15, 200), 429, 429]);
  // The rest are told that it is the check that is in trouble, not them
  await expect(door.admit('link', from('203.0.113.99', PERSON))).rejects.toThrow('The check that you are a person is not working just now. Try again in a little while.');
  // Without any proof nobody is let through, whatever state Cloudflare is in
  expect(await status(door.admit('link', from('203.0.113.11')))).toBe(403);
  said.mockRestore();
});

test('an answer from Cloudflare that is not a plain yes is a no', async () => {
  const said = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const door = createDoor({ humanCheck: KEYS });
  const unclear = [
    new Response('down for maintenance', { status: 503 }),
    new Response('slow down', { status: 429 }),
    new Response('<html>something else altogether</html>'),
    Response.json({ success: 'yes' }),
    Response.json(null),
  ];
  for (const answer of unclear) {
    vi.stubGlobal('fetch', vi.fn(async () => answer));
    expect(await status(door.admit('link', from('203.0.113.12', PERSON)))).toBe(403);
  }
  expect(said, 'the two answers that were refusals are written in the server log').toHaveBeenCalledTimes(2);
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
      link: (who: ReturnType<typeof browser>, email = 'nora@marlow.example') => who.post('/api/auth/sign-in/magic-link', { email, callbackURL: '/' }),
      join: (who: ReturnType<typeof browser>) => who.post('/api/join', { name: 'A cousin', email: 'cousin@example.com' }),
      suggest: (who: ReturnType<typeof browser>) => who.edit(rosalind, { mode: 'suggest', contact: { name: 'A cousin', email: 'cousin@example.com' } }),
    };
    /* Someone at an address of their own on the network, with proof that they are a person. */
    const person = (sender: string) => {
      const who = browser(demo.app, sender);
      who.proves(PERSON);
      return who;
    };
    for (const [what, ask] of Object.entries(asks)) {
      const stranger = browser(demo.app, '203.0.113.20');
      const turnedAway = await ask(stranger);
      expect(turnedAway.status, `${what}, with no proof`).toBe(403);
      // The sign-in library says its refusals under "message", the web API under "error"
      expect(turnedAway.data.message ?? turnedAway.data.error, what).toBe('The check that you are a person did not pass. Try again.');
      stranger.proves(ROBOT);
      expect((await ask(stranger)).status, `${what}, with proof Cloudflare turns down`).toBe(403);
      stranger.proves(PERSON);
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

    // One address is not written to over and over. Whoever asks too often is turned away, and told why.
    const eager = person('203.0.113.23');
    const heard = await inTurn(4, () => asks.link(eager));
    expect(heard.map((answer) => answer.status)).toEqual([200, 200, 200, 429]);
    expect(heard.at(-1)?.data.message).toBe('Too many sign-in links were asked for this address. Try again later, or sign in with a passkey.');
    await vi.waitFor(() => expect(letters, 'three more letters, after the one above').toHaveBeenCalledTimes(4));
    // That has not used up the tries of the one whose address it is, who asks from somewhere else
    expect((await asks.link(person('203.0.113.24'))).status).toBe(200);
    await vi.waitFor(() => expect(letters).toHaveBeenCalledTimes(5));

    // An address nobody has an account with is answered just the same, so the answers give nothing away. No letter goes to it.
    const curious = person('203.0.113.25');
    const guesses = await inTurn(4, () => asks.link(curious, 'nobody@example.com'));
    expect(guesses.map((answer) => answer.status)).toEqual([200, 200, 200, 429]);
    expect(guesses.at(-1)?.data.message).toBe(heard.at(-1)?.data.message);
    expect(letters).toHaveBeenCalledTimes(5);
  } finally {
    demo.close();
  }
});

test('a sender on the newer kind of network is counted by its block of addresses, not by each one', async () => {
  const door = createDoor({});
  // One sender holds the whole block and writes from a new address every time
  expect(await answers(7, (nth) => door.admit('join', from(`2001:db8:1:2::${(nth + 1).toString(16)}`)))).toEqual([...all(5, 200), 429, 429]);
  // The same block however it is written out
  expect(await status(door.admit('join', from('2001:0db8:0001:0002:aaaa:bbbb:cccc:dddd')))).toBe(429);
  // Another block is another sender
  expect(await status(door.admit('join', from('2001:db8:1:3::1')))).toBe(200);
  // An older address written the newer way is the same sender as when it is written the old way
  expect(await answers(6, (nth) => door.admit('join', from(nth % 2 ? '::ffff:203.0.113.9' : '203.0.113.9')))).toEqual([...all(5, 200), 429]);
  // And its letters are counted for the block too
  expect(await answers(4, (nth) => door.admit('link', from(`2001:db8:9:9::${nth + 1}`), 'nora@marlow.example'))).toEqual([...all(3, 200), 429]);
});
