/*
 * The journeys of the plan, end to end through the web API and the sign-in
 * library, against a real database: who sees what, who may change what,
 * suggestions and review, undo, drafts, invitations and data in and out.
 */

import type { Op } from '@reactive-family-tree/core';
import { media } from '@reactive-family-tree/db';
import { afterAll, beforeAll, expect, test, vi } from 'vitest';

import { browser, startDemo } from '../src/testing';
import type { Demo } from '../src/testing';

import { phonePhoto } from './photo';

let demo: Demo;
beforeAll(async () => { demo = await startDemo(); });
afterAll(() => demo.close());

const rename = (person: string, given: string): Op[] => [{ type: 'person.update', person, set: { given } }];
const newChild = (union: string, given: string): Op[] => [
  { type: 'person.create', ref: '$kid', set: { given, family: 'Test', living: 'yes' } },
  { type: 'fact.add', subject: { type: 'person', id: '$kid' }, set: { type: 'birth', date: { kind: 'exact', from: '2020' } } },
  { type: 'child.link', union, child: '$kid' },
];
/* What the API sends, read loosely. */
interface Leaf { id: string; given?: string; masked?: boolean; pending?: { status: string } | null }
interface Shown { id: string; message: string; status: string; lines: { text: string; fields: { was?: string; to: string }[] }[] }

test('a visitor sees the shape of the tree but nothing about the living', async () => {
  const visitor = browser(demo.app);
  const { data: tree } = await visitor.get('/api/tree');
  const masked = tree.people.filter((p: Leaf) => p.masked);
  expect(tree.people.length).toBe(50);
  expect(masked.length).toBe(39);
  for (const p of masked) expect(Object.keys(p).sort(), 'a masked person carries nothing but a placeholder').toEqual(['id', 'masked']);
  expect(tree.people.some((p: Leaf) => p.given === 'Elias'), 'people who have died are shown').toBe(true);
  expect(JSON.stringify(tree), 'no living name anywhere in what a visitor receives').not.toContain('Sophie');

  expect((await visitor.get(`/api/people/${demo.idOf('Sophie')}`)).status).toBe(404);
  expect((await visitor.get('/api/people?q=sophie')).data.people.length).toBe(0);
  expect((await visitor.get('/api/people?q=elias')).data.people.length).toBe(1);
  expect((await visitor.get('/api/edits?which=activity')).status).toBe(401);
  expect((await visitor.get('/api/members')).status).toBe(401);
});

test('a private tree shows a visitor nothing at all', async () => {
  const owner = browser(demo.app);
  await owner.signInAs('helen');
  await owner.patch('/api/settings', { visibility: 'private' });
  const visitor = browser(demo.app);
  const { data: tree } = await visitor.get('/api/tree');
  expect(tree.closed).toBe(true);
  expect(tree.people.length).toBe(0);
  expect((await visitor.get(`/api/people/${demo.idOf('Elias')}`)).status).toBe(403);
  expect((await visitor.get(`/api/relationship?from=${demo.idOf('Elias')}&to=${demo.idOf('Ada', 'Marlow')}`)).status, 'not even how two people are related').toBe(404);
  await owner.patch('/api/settings', { visibility: 'public_masked' });
});

test('edits inside your branch publish at once, edits elsewhere become suggestions', async () => {
  const margaret = browser(demo.app);
  await margaret.signInAs('margaret');
  const before = (await margaret.get('/api/tree')).data;

  const inside = await margaret.edit(newChild(demo.unionOf(demo.idOf('Clara')), 'Robin'));
  expect(inside.data.status).toBe('applied');
  const tree = (await margaret.get('/api/tree')).data;
  expect(tree.seq).toBe(before.seq + 1);
  expect(tree.people.some((p: Leaf) => p.given === 'Robin' && !p.pending)).toBe(true);

  const outside = await margaret.edit(rename(demo.idOf('Walter'), 'Walt'));
  expect(outside.data.status).toBe('suggested');
  expect((await margaret.get('/api/tree')).data.seq, 'a suggestion does not change the tree').toBe(tree.seq);
  // the button label is known in advance
  expect((await margaret.edit(rename(demo.idOf('Walter'), 'W'), { mode: 'dry' })).data.status).toBe('suggested');
  expect((await margaret.edit(rename(demo.idOf('Clara'), 'Clara'), { mode: 'dry' })).data.status).toBe('applied');

  const daniel = browser(demo.app);
  await daniel.signInAs('daniel');
  expect((await daniel.edit(rename(demo.idOf('Daniel'), 'Dan'))).data.status, 'a member can always edit their own leaf').toBe('applied');
  expect((await daniel.edit(rename(demo.idOf('Nora'), 'N'))).data.status).toBe('suggested');
  await daniel.edit(rename(demo.idOf('Daniel'), 'Daniel'));
});

test('a suggestion reaches the right reviewers and is approved, adjusted or declined', async () => {
  const karl = browser(demo.app);
  await karl.signInAs('karl');
  const queue: Shown[] = (await karl.get('/api/edits?which=review')).data.edits;
  expect(queue.map((e) => e.message), 'a steward reviews only what lands in his branch').toEqual(['Add Lena, Karl and Ines’s youngest']);
  const waiting = queue[0] as Shown;
  expect((await karl.get('/api/tree')).data.people.some((p: Leaf) => p.given === 'Lena' && p.pending), 'shown on his tree in pencil').toBe(true);

  const sophie = browser(demo.app);
  await sophie.signInAs('sophie');
  expect((await sophie.post(`/api/edits/${waiting.id}/review`, { action: 'approve' })).status, 'you cannot approve your own suggestion').toBe(403);

  const approved = await karl.post(`/api/edits/${waiting.id}/review`, { action: 'approve' });
  expect(approved.data.status).toBe('applied');
  expect(approved.data.edit.author, 'credit stays with the person who suggested it').toBe('Sophie Stein');
  expect(approved.data.edit.reviewedBy).toBe('Karl Lindqvist');
  expect((await sophie.get('/api/tree')).data.people.some((p: Leaf) => p.given === 'Lena' && !p.pending)).toBe(true);
  expect((await sophie.get('/api/notifications')).data.notifications.some((n: { kind: string }) => n.kind === 'approved')).toBe(true);

  const peter = browser(demo.app);
  await peter.signInAs('peter');
  const forAdmin: Shown[] = (await peter.get('/api/edits?which=review')).data.edits;
  const birthday = forAdmin.find((e) => e.message.startsWith('Edith')) as Shown;
  expect(birthday.lines[0]?.fields[0]?.was).toBe('1930');
  expect(birthday.lines[0]?.fields[0]?.to).toBe('12 May 1930');
  expect((await peter.post(`/api/edits/${birthday.id}/review`, { action: 'decline' })).status, 'declining needs a reason').toBe(400);
  const declined = await peter.post(`/api/edits/${birthday.id}/review`, { action: 'decline', note: 'The parish record says 14 May.' });
  expect(declined.data.status).toBe('declined');

  const walter = forAdmin.find((e) => e.lines[0]?.text.includes('Walter')) as Shown;
  const adjusted = await peter.post(`/api/edits/${walter.id}/review`, { action: 'approve', ops: rename(demo.idOf('Walter'), 'Walter J.') });
  expect(adjusted.data.status).toBe('applied');
  expect((await peter.get(`/api/people/${demo.idOf('Walter')}`)).data.given).toBe('Walter J.');
});

test('every edit can be undone, and undo refuses to trample later changes', async () => {
  const peter = browser(demo.app);
  await peter.signInAs('peter');
  const first = await peter.edit(rename(demo.idOf('Hana'), 'Hanako'));
  const second = await peter.edit(rename(demo.idOf('Hana'), 'Hanna'));

  const blocked = await peter.post(`/api/edits/${first.data.editId}/revert`);
  expect(blocked.status, 'a later edit changed the same person').toBe(409);
  expect((await peter.post(`/api/edits/${second.data.editId}/revert`)).data.status).toBe('applied');
  expect((await peter.post(`/api/edits/${first.data.editId}/revert`)).data.status).toBe('applied');
  expect((await peter.get(`/api/people/${demo.idOf('Hana')}`)).data.given).toBe('Hana');

  const history: Shown[] = (await peter.get(`/api/edits?which=activity&person=${demo.idOf('Hana')}`)).data.edits;
  expect(history.filter((e) => e.status === 'reverted').length, 'nothing is erased from history').toBe(2);
  expect(history.filter((e) => e.message.startsWith('Undo')).length).toBe(2);
});

test('edits that break the family are refused with a reason', async () => {
  const peter = browser(demo.app);
  await peter.signInAs('peter');
  const dead = await peter.edit([{ type: 'fact.add', subject: { type: 'person', id: demo.idOf('Sophie') }, set: { type: 'death', date: { kind: 'exact', from: '1950' } } }]);
  expect(dead.status).toBe(422);
  expect(dead.data.error).toMatch(/cannot have died/);

  const loop = await peter.edit([{ type: 'child.link', union: demo.unionOf(demo.idOf('Clara')), child: demo.idOf('Margaret') }]);
  expect(loop.status).toBe(422);
  expect(loop.data.error).toMatch(/own ancestor/);
  expect((await peter.edit([{ type: 'person.update', person: demo.idOf('Sophie'), set: { sex: 'robot' } }] as unknown as Op[])).status).toBe(422);
});

test('only a living person can make themselves public', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const sophieId = demo.idOf('Sophie');
  const refused = await helen.edit([{ type: 'person.update', person: sophieId, set: { privacy: 'public' } }]);
  expect(refused.status).toBe(403);
  await helen.patch('/api/settings', { visibility: 'public' });

  const visitor = browser(demo.app);
  expect((await visitor.get(`/api/people/${sophieId}`)).status).toBe(404);
  const sophie = browser(demo.app);
  await sophie.signInAs('sophie');
  expect((await sophie.edit([{ type: 'person.update', person: sophieId, set: { privacy: 'public' } }])).data.status).toBe('applied');
  expect((await visitor.get(`/api/people/${sophieId}`)).data.name).toBe('Sophie Stein');

  await sophie.edit([{ type: 'person.update', person: sophieId, set: { privacy: 'default' } }]);
  expect((await visitor.get(`/api/people/${sophieId}`)).status, 'consent ends when she changes her mind').toBe(404);
  await helen.patch('/api/settings', { visibility: 'public_masked' });
});

test('removing goes to the compost, and restoring brings a person back', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const leo = demo.idOf('Leo');
  expect((await nora.edit([{ type: 'person.remove', person: leo }])).data.status).toBe('applied');
  expect((await nora.get('/api/tree')).data.people.some((p: Leaf) => p.id === leo)).toBe(false);
  expect((await nora.edit([{ type: 'person.remove', person: demo.idOf('Sam') }])).data.status, 'someone with children needs an admin').toBe('suggested');

  const helen = browser(demo.app);
  await helen.signInAs('helen');
  expect((await helen.get('/api/compost')).data.people.some((p: Leaf) => p.id === leo)).toBe(true);
  expect((await helen.edit([{ type: 'person.restore', person: leo }])).data.status).toBe('applied');
  expect((await nora.get('/api/tree')).data.people.some((p: Leaf) => p.id === leo)).toBe(true);
  expect((await nora.get('/api/compost')).status).toBe(403);
});

test('a person in the compost can be removed for good, and the sweep does it after thirty days', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const max = demo.idOf('Max');
  await helen.edit([{ type: 'person.remove', person: max }]);
  expect(await demo.app.edits.sweepCompost(), 'nothing is old enough yet').toBe(0);
  expect((await helen.post(`/api/compost/${max}/purge`)).status).toBe(200);
  expect((await helen.get('/api/compost')).data.people.some((p: Leaf) => p.id === max)).toBe(false);
  expect(demo.app.store.state.people.has(max)).toBe(false);
  expect([...demo.app.store.state.facts.values()].some((fact) => fact.subject.id === max), 'their facts go with them').toBe(false);
});

test('an AI draft is private until its owner applies it, whole or in part', async () => {
  const margaret = browser(demo.app);
  await margaret.signInAs('margaret');
  const drafts = (await margaret.get('/api/edits?which=mine')).data.edits.filter((e: Shown) => e.status === 'draft');
  expect(drafts.length).toBe(1);
  expect(drafts[0].origin).toBe('mcp');
  expect(drafts[0].client).toBe('Claude on my laptop');
  expect((await margaret.get('/api/tree')).data.people.some((p: Leaf) => p.given === 'Juno' && p.pending?.status === 'draft')).toBe(true);

  const helen = browser(demo.app);
  await helen.signInAs('helen');
  expect((await helen.get('/api/tree')).data.people.some((p: Leaf) => p.given === 'Juno'), 'nobody else sees a draft, not even the owner of the tree').toBe(false);
  expect((await helen.get(`/api/edits/${drafts[0].id}`)).status).toBe(404);

  // apply only the link of the baby: the baby and nothing else comes along, the birthday fix stays in the draft
  const part = await margaret.post(`/api/edits/${drafts[0].id}/apply`, { indexes: [2] });
  expect(part.data.status).toBe('applied');
  expect(part.data.remaining).toBe(2);
  expect((await helen.get('/api/tree')).data.people.some((p: Leaf) => p.given === 'Juno' && !p.pending)).toBe(true);
  const rest = await margaret.post(`/api/edits/${drafts[0].id}/apply`, {});
  expect(rest.data.status).toBe('applied');
  expect(rest.data.remaining).toBe(0);
  expect(rest.data.edit.origin, 'history remembers it came from an AI').toBe('mcp');
});

test('invitations and sign-in links work once', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const invite = (await helen.post('/api/invites', { email: 'elin@marlow.example', personId: demo.idOf('Elin'), role: 'member', grantBranch: true })).data;
  expect(invite.emailedTo, 'no email is set up here, so the link is passed on by hand').toBeNull();
  const token = new URL(invite.link).searchParams.get('invite');

  const elin = browser(demo.app);
  expect((await elin.get(`/api/invites/open?token=${token}`)).data.personName).toBe('Elin Lindqvist');
  expect((await elin.post('/api/auth/family/accept-invite', { token, name: 'Elin Lindqvist', email: 'elin@marlow.example' })).status).toBe(200);
  const session = (await elin.get('/api/session')).data;
  expect(session.user.personId).toBe(demo.idOf('Elin'));
  expect(session.user.anchors, 'invited as herself, she looks after her own branch').toEqual([demo.idOf('Elin')]);
  expect((await browser(demo.app).post('/api/auth/family/accept-invite', { token, name: 'Mallory', email: 'm@example.com' })).status).toBe(400);

  // An emailed link. For the ready-made accounts of the made-up family, the page that asked may fetch it once, as there is no mailbox to read.
  const asker = browser(demo.app);
  await asker.post('/api/auth/sign-in/magic-link', { email: 'nora@marlow.example', callbackURL: '/' });
  const link = (await asker.get('/api/demo/link?email=nora@marlow.example')).data.link as string;
  expect(link).toContain('/api/auth/magic-link/verify');
  expect((await asker.get('/api/demo/link?email=nora@marlow.example')).data.link, 'handed over once').toBeNull();
  const path = link.slice(new URL(link).origin.length);
  const again = browser(demo.app);
  await again.get(path);
  expect((await again.get('/api/session')).data.user.name).toBe('Nora Bell');
  const replay = browser(demo.app);
  await replay.get(path);
  expect((await replay.get('/api/session')).data.user, 'a link works once').toBeNull();

  // An account somebody made for themselves is a real one, even here. Its link is mailed, and never handed to a page.
  await asker.post('/api/auth/sign-in/magic-link', { email: 'elin@marlow.example', callbackURL: '/' });
  expect((await asker.get('/api/demo/link?email=elin@marlow.example')).status).toBe(404);

  // Nobody can make an account for themselves by asking for a link, and nothing is sent to an address without one
  const stranger = browser(demo.app);
  const letters = vi.spyOn(demo.app.mailer, 'send');
  expect((await stranger.post('/api/auth/sign-in/magic-link', { email: 'nobody@example.com', callbackURL: '/' })).status, 'the page is told the same either way').toBe(200);
  expect(letters, 'no letter went out').not.toHaveBeenCalled();
  letters.mockRestore();
  expect((await stranger.get('/api/demo/link?email=nobody@example.com')).status).toBe(404);
  expect((await stranger.get('/api/session')).data.user).toBeNull();

  // stewards invite within their branch only, and only an owner makes owners
  const karl = browser(demo.app);
  await karl.signInAs('karl');
  expect((await karl.post('/api/invites', { personId: demo.idOf('Vera') })).status).toBe(200);
  expect((await karl.post('/api/invites', { personId: demo.idOf('Iris') })).status).toBe(403);
  const peter = browser(demo.app);
  await peter.signInAs('peter');
  const members: { id: string; name: string; role: string }[] = (await peter.get('/api/members')).data.members;
  const idOfMember = (test: (m: { name: string; role: string }) => boolean) => (members.find(test) as { id: string }).id;
  expect((await peter.patch(`/api/members/${idOfMember((m) => m.name === 'Karl Lindqvist')}`, { role: 'owner' })).status).toBe(403);
  expect((await helen.patch(`/api/members/${idOfMember((m) => m.role === 'owner')}`, { role: 'member' })).status, 'a tree always has an owner').toBe(400);
});

test('the family can leave with all its data, and come back', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const gedcom: string = (await helen.get('/api/export/gedcom')).data;
  expect(gedcom).toMatch(/1 NAME Ada \/Finch\//);
  expect(gedcom).toMatch(/2 DATE ABT 1955/);
  const people = (await helen.get('/api/tree')).data.people.length;
  expect(gedcom.match(/ INDI$/gm)?.length).toBe(people);

  // importing stages a draft the admin previews before anything is written
  const staged = (await helen.post('/api/import/gedcom', { text: gedcom })).data;
  expect(staged.status).toBe('draft');
  expect(staged.people).toBe(people);
  expect((await helen.get('/api/tree')).data.people.filter((p: Leaf) => !p.pending).length).toBe(people);
  expect(staged.warnings.some((w: { code: string }) => w.code === 'possible_duplicate'), 'importing the same family again is noticed').toBe(true);
  await helen.post(`/api/edits/${staged.editId}/discard`);

  const backup = (await helen.get('/api/export/backup')).data;
  expect(backup.format).toBe('reactive-family-tree-backup');
  expect(JSON.stringify(backup), 'the secret that signs sessions never leaves in a backup').not.toContain('auth_secret');
  await helen.edit(rename(demo.idOf('Marta'), 'Changed'));
  expect((await browser(demo.app).post('/api/import/backup', { backup })).status).toBe(401);
  expect((await helen.post('/api/import/backup', { backup })).status).toBe(200);
  await helen.signInAs('helen');
  expect((await helen.get(`/api/people/${demo.idOf('Marta')}`)).data.given).toBe('Marta');
  expect((await helen.patch('/api/settings', { livingAge: 5 })).status).toBe(400);
});

test('the family chooses its music: the melody in the background, the tune for the years, and which melody', async () => {
  const helen = browser(demo.app), nora = browser(demo.app), visitor = browser(demo.app);
  await helen.signInAs('helen');
  await nora.signInAs('nora');
  const heard = async (who: typeof helen) => { const { music, melody } = (await who.get('/api/session')).data.settings; return [music, melody]; };

  // Out of the box there is music to be had, and it waits to be turned on
  expect(await heard(visitor)).toEqual(['off', 'morning-mist']);
  expect((await nora.patch('/api/settings', { music: 'on' })).status, 'only an admin chooses').toBe(403);
  expect((await helen.patch('/api/settings', { music: 'on', melody: 'koto-garden' })).status).toBe(200);
  expect([await heard(visitor), await heard(nora)], 'every browser is told, signed in or not').toEqual([['on', 'koto-garden'], ['on', 'koto-garden']]);
  expect((await helen.patch('/api/settings', { music: 'none' })).status).toBe(200);
  expect((await heard(visitor))[0], 'off for everyone').toBe('none');

  for (const wrong of [{ music: 'loud' }, { music: true }, { melody: '' }, { melody: 'Not A Name' }, { melody: '../etc/passwd' }, { melody: 'a'.repeat(41) }]) {
    expect((await helen.patch('/api/settings', wrong)).status, JSON.stringify(wrong)).toBe(400);
  }
  expect(await heard(visitor), 'a wrong value changes nothing').toEqual(['none', 'koto-garden']);

  // The tune that goes with the Play button is a setting of its own: it stays while the background melody is off for everyone
  const withYears = async () => (await visitor.get('/api/session')).data.settings.playMusic;
  expect([(await heard(visitor))[0], await withYears()]).toEqual(['none', true]);
  expect((await helen.patch('/api/settings', { playMusic: false })).status).toBe(200);
  expect([(await heard(visitor))[0], await withYears()], 'and can be turned off without touching the other').toEqual(['none', false]);
  expect((await helen.patch('/api/settings', { playMusic: 'yes' })).status).toBe(400);

  // And it has a melody of its own, chosen apart from the one in the background
  const madeFrom = async () => { const { melody, playMelody } = (await visitor.get('/api/session')).data.settings; return [melody, playMelody]; };
  expect(await madeFrom()).toEqual(['koto-garden', 'morning-mist']);
  expect((await helen.patch('/api/settings', { playMelody: 'island-song' })).status).toBe(200);
  expect(await madeFrom(), 'the background melody is left as it was').toEqual(['koto-garden', 'island-song']);
  expect((await helen.patch('/api/settings', { playMelody: 'Not A Name' })).status).toBe(400);
  await helen.patch('/api/settings', { music: 'off', playMusic: true, melody: 'morning-mist', playMelody: 'morning-mist' });
});

test('the family chooses whether the tree opens light or dark', async () => {
  const helen = browser(demo.app), nora = browser(demo.app), visitor = browser(demo.app);
  await helen.signInAs('helen');
  await nora.signInAs('nora');
  const opens = async () => (await helen.get('/api/settings')).data.appearance;

  // Out of the box it is left to each person's device
  expect(await opens()).toBe('device');
  expect((await nora.patch('/api/settings', { appearance: 'dark' })).status, 'only an admin chooses').toBe(403);
  expect((await helen.patch('/api/settings', { appearance: 'dark' })).status).toBe(200);
  expect(await opens()).toBe('dark');

  for (const wrong of [{ appearance: 'night' }, { appearance: 'Dark' }, { appearance: '' }, { appearance: true }, { appearance: null }]) {
    expect((await helen.patch('/api/settings', wrong)).status, JSON.stringify(wrong)).toBe(400);
  }
  expect(await opens(), 'a wrong value changes nothing').toBe('dark');

  // Each page is told as it is made, before anything is drawn. It is not among what a browser asks for afterwards.
  expect(Object.keys((await visitor.get('/api/session')).data.settings)).not.toContain('appearance');
  expect((await helen.patch('/api/settings', { appearance: 'device' })).status).toBe(200);
  expect(await opens()).toBe('device');
});

test('the family says where it is, to the whole degree, and a stranger at a private tree is not told', async () => {
  const helen = browser(demo.app), nora = browser(demo.app), visitor = browser(demo.app);
  await helen.signInAs('helen');
  await nora.signInAs('nora');
  const placeOf = async (who: typeof helen) => { const { latitude, longitude } = (await who.get('/api/session')).data.settings; return [latitude, longitude]; };
  const kept = async () => { const { timezone, latitude, longitude } = (await helen.get('/api/settings')).data; return [timezone, latitude, longitude]; };

  // Nobody has said yet
  expect([await kept(), await placeOf(visitor)]).toEqual([['', null, null], [null, null]]);
  expect((await nora.patch('/api/settings', { latitude: 32, longitude: 35 })).status, 'only an admin says').toBe(403);
  expect((await helen.patch('/api/settings', { timezone: 'Asia/Jerusalem', latitude: 32, longitude: 35 })).status).toBe(200);
  expect(await kept()).toEqual(['Asia/Jerusalem', 32, 35]);
  // The demo family's tree is open to visitors, and the sky over it is the same for all of them
  expect([await placeOf(visitor), await placeOf(nora)]).toEqual([[32, 35], [32, 35]]);
  expect('timezone' in (await visitor.get('/api/session')).data.settings, 'the timezone is the admin\'s to know').toBe(false);

  // A place is no closer than a whole degree, which is about a hundred kilometres, and a timezone is one the clocks know
  const wrong = [{ latitude: 32.0853 }, { longitude: 34.7818 }, { latitude: 91 }, { longitude: -181 }, { latitude: '32' }, { timezone: 'Mars/Olympus' }, { timezone: 7 }, { timezone: 'a'.repeat(65) }];
  for (const patch of wrong) expect((await helen.patch('/api/settings', patch)).status, JSON.stringify(patch)).toBe(400);
  expect(await kept(), 'a wrong value changes nothing').toEqual(['Asia/Jerusalem', 32, 35]);
  // South and west are the minus ways
  expect((await helen.patch('/api/settings', { timezone: 'America/Sao_Paulo', latitude: -24, longitude: -47 })).status).toBe(200);
  expect(await placeOf(visitor)).toEqual([-24, -47]);

  // Closed to strangers, the tree keeps where it is from them too
  expect((await helen.patch('/api/settings', { visibility: 'private' })).status).toBe(200);
  expect([await placeOf(visitor), await placeOf(nora)]).toEqual([[null, null], [-24, -47]]);

  // And it can be taken back
  expect((await helen.patch('/api/settings', { visibility: 'public_masked', timezone: '', latitude: null, longitude: null })).status).toBe(200);
  expect([await kept(), await placeOf(nora)]).toEqual([['', null, null], [null, null]]);
});

test('trying a change out tells a stranger nothing about people who are kept private', async () => {
  const helen = browser(demo.app), visitor = browser(demo.app);
  await helen.signInAs('helen');
  const nora = demo.idOf('Nora');
  // A child born in the year 1, hung on Nora's family: what the family makes of that names both parents and their years
  const probe: Op[] = [
    { type: 'person.create', ref: '$x', set: { given: 'Zed', family: 'Probe' } },
    { type: 'fact.add', subject: { type: 'person', id: '$x' }, set: { type: 'birth', date: { kind: 'exact', from: '0001' } } },
    { type: 'child.link', union: demo.unionOf(nora), child: '$x' },
  ];
  // Someone with the name and year of a person already on the tree
  const twin: Op[] = [
    { type: 'person.create', ref: '$x', set: { given: 'Nora', family: 'Bell' } },
    { type: 'fact.add', subject: { type: 'person', id: '$x' }, set: { type: 'birth', date: { kind: 'exact', from: '1975' } } },
  ];
  const dry = async (who: typeof helen, ops: Op[]) => (await who.post('/api/edits', { mode: 'dry', ops })).data;
  const told = (answer: unknown) => JSON.stringify(answer);

  // An admin is told, which is what the warnings are for
  expect(told(await dry(helen, probe))).toContain('Nora Bell (born 1975) is recorded as a parent of Zed Probe');
  expect((await dry(helen, twin)).warnings.map((issue: { code: string }) => issue.code)).toContain('possible_duplicate');

  // A stranger who may not suggest is told no, and nothing else
  await helen.patch('/api/settings', { visitorsCanSuggest: false });
  const refused = await dry(visitor, probe);
  expect([refused.status, refused.warnings]).toEqual(['denied', []]);
  expect(told(await dry(visitor, twin))).not.toContain('possible_duplicate');

  // Where strangers may suggest, they are told only of people they can see. Nora is living, so she is not one of them.
  await helen.patch('/api/settings', { visitorsCanSuggest: true });
  for (const ops of [probe, twin]) {
    const answer = await dry(visitor, ops);
    expect(answer.status).toBe('suggested');
    expect(answer.warnings, told(answer)).toEqual([]);
    expect(told(answer)).not.toMatch(/Nora|Bell|1975|Sam/);
  }
  // Something that breaks the family says so, without saying whom it is about
  const died: Op[] = [{ type: 'fact.add', subject: { type: 'person', id: nora }, set: { type: 'death', date: { kind: 'exact', from: '1900' } } }];
  const broken = await visitor.post('/api/edits', { mode: 'dry', ops: died });
  expect(told(broken.data)).not.toMatch(/Nora|Bell|1975/);
  expect((await helen.post('/api/edits', { mode: 'dry', ops: died })).data.error).toContain('Nora Bell cannot have died (1900) before being born (1975)');

  // A card of someone who has died says nothing of a living partner: not who, not since when, not how it stands
  const thomas = demo.idOf('Thomas');
  const known = (await helen.get(`/api/people/${thomas}`)).data.unions[0];
  expect([typeof known.partner.id, known.status === 'unknown'], 'an admin reads it all').toEqual(['string', false]);
  const card = (await visitor.get(`/api/people/${thomas}`)).data;
  const [marriage] = card.unions;
  expect([marriage.partner.masked, marriage.partner.id, marriage.since, marriage.status, marriage.kind]).toEqual([true, null, null, 'unknown', 'unknown']);
  expect(told(card), 'her id is not in it anywhere').not.toContain(known.partner.id);
});

test('nobody can fill the server by sending something enormous, or a pile of requests to join', async () => {
  const visitor = browser(demo.app, '203.0.113.1');
  const huge = await visitor.post('/api/join', { name: 'A', email: 'a@example.com', message: 'x'.repeat(13 * 1024 * 1024) });
  expect(huge.status, 'more than an import or a backup could ever be').toBe(413);
  expect((await visitor.post('/api/join', { name: 'A', email: `a@${'x'.repeat(260)}.com` })).status, 'no address is that long').toBe(400);

  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const waiting = async (): Promise<{ name: string; email: string }[]> => (await helen.get('/api/members')).data.requests;
  const before = (await waiting()).length;

  // Nothing proves an email address is the asker's own, so nobody can take a relative's place by giving it first, or write over
  // what they sent. An admin is shown every request as it was written, and decides.
  expect((await visitor.post('/api/join', { name: 'Ruth', email: 'ruth@example.com', message: 'It is me, Ruth' })).status).toBe(200);
  const impostor = browser(demo.app, '198.51.100.9');
  expect((await impostor.post('/api/join', { name: 'Not Ruth', email: 'Ruth@Example.com', message: 'Let me in' })).status).toBe(200);
  expect((await waiting()).filter((request) => request.email === 'ruth@example.com').map((request) => request.name)).toEqual(['Ruth', 'Not Ruth']);

  // One sender gets a few tries an hour. Then it waits, and everyone else can still ask.
  const eager = browser(demo.app, '203.0.113.50');
  const answers: number[] = [];
  for (let asked = 0; asked < 7; asked++) answers.push((await eager.post('/api/join', { name: `Asker ${asked}`, email: `asker${asked}@example.com` })).status);
  expect(answers).toEqual([200, 200, 200, 200, 200, 429, 429]);
  expect((await browser(demo.app, '203.0.113.51').post('/api/join', { name: 'A cousin', email: 'cousin@example.com' })).status).toBe(200);
  // Behind more than one proxy, it is the nearest one that is believed, whatever the sender wrote in front of it
  const dressedUp = browser(demo.app, '10.9.9.9, 203.0.113.50');
  expect((await dressedUp.post('/api/join', { name: 'Asker again', email: 'again@example.com' })).status).toBe(429);

  // A sender nothing is known about is not counted with every other such sender
  const unknown = browser(demo.app);
  for (let asked = 0; asked < 7; asked++) expect((await unknown.post('/api/join', { name: `Someone ${asked}`, email: `someone${asked}@example.com` })).status).toBe(200);

  // Nothing that waits was thrown away to make room
  const kept = (await waiting()).map((request) => request.name);
  expect(kept.length).toBe(before + 15);
  expect(kept).toEqual(expect.arrayContaining(['Ruth', 'Not Ruth', 'Asker 0', 'Asker 4', 'A cousin', 'Someone 6']));
});

test('history and search keep to what each relative may see', async () => {
  const nora = browser(demo.app), sophie = browser(demo.app), helen = browser(demo.app);
  await nora.signInAs('nora');
  await sophie.signInAs('sophie');
  await helen.signInAs('helen');
  const leo = demo.idOf('Leo');
  const leafOf = async (who: typeof nora, id: string) => (await who.get('/api/tree')).data.people.find((p: Leaf) => p.id === id);
  const found = async (who: typeof nora, words: string): Promise<{ id: string; born: number | null }[]> => (await who.get(`/api/people?q=${words}`)).data.people;

  // Nora looks after Leo, and keeps where he was born to herself
  const birth = (await nora.get(`/api/people/${leo}`)).data.facts.find((fact: { type: string }) => fact.type === 'birth');
  const secret = (await nora.edit([{ type: 'fact.update', fact: birth.id, set: { place: 'Hiddenham', privacy: 'private' } }])).data;
  expect(secret.status).toBe('applied');

  // Searching by the place finds him for her, and for nobody who may not see the fact. His year goes with it.
  expect((await found(nora, 'hiddenham')).map((hit) => hit.id)).toEqual([leo]);
  expect(await found(sophie, 'hiddenham')).toEqual([]);
  expect((await found(sophie, 'leo')).find((hit) => hit.id === leo)?.born, 'a cousin still finds him by name, without the year').toBeNull();
  expect((await found(sophie, '2008')).some((hit) => hit.id === leo), 'and not by the year').toBe(false);
  expect((await leafOf(sophie, leo)).born).toBeNull();
  expect((await leafOf(nora, leo)).born).toBe(2008);

  // History says that something changed, and to a cousin nothing of what
  expect(JSON.stringify((await nora.get(`/api/edits/${secret.editId}`)).data), 'its author reads it as written').toContain('Hiddenham');
  expect(JSON.stringify((await helen.get(`/api/edits/${secret.editId}`)).data), 'and so does an admin').toContain('Hiddenham');
  const theirs = await sophie.get(`/api/edits/${secret.editId}`);
  expect(theirs.status).toBe(200);
  expect(theirs.data.lines.map((line: { text: string }) => line.text)).toEqual(['One more change, to something private.']);
  const listed = (await sophie.get(`/api/edits?which=activity&person=${leo}`)).data.edits;
  expect(listed.length).toBeGreaterThan(0);
  expect(JSON.stringify([theirs.data, listed])).not.toMatch(/Hiddenham|2008/);

  // A whole person can be private. Then their history is not for other relatives to read at all.
  const tess = demo.idOf('Tess');
  await helen.edit([{ type: 'person.update', person: tess, set: { privacy: 'private' } }]);
  const about = (await helen.edit([{ type: 'person.update', person: tess, set: { bio: 'Keeps a walled garden.' } }])).data;
  expect((await sophie.get(`/api/edits?which=activity&person=${tess}`)).status).toBe(404);
  expect((await sophie.get(`/api/edits/${about.editId}`)).status).toBe(404);
  expect((await helen.get(`/api/edits/${about.editId}`)).data.lines[0].text).toContain('Tess');
  // Where she is one of several people in an edit, she is there without her name
  const everyone = (await sophie.get(`/api/edits?which=activity&person=${leo}`)).data.edits;
  expect(JSON.stringify(everyone)).not.toMatch(/Tess|walled garden/);

  await helen.edit([{ type: 'person.update', person: tess, set: { privacy: 'default' } }]);
  await nora.edit([{ type: 'fact.update', fact: birth.id, set: { place: birth.place, privacy: 'default' } }]);
  expect((await leafOf(sophie, leo)).born, 'made open again, the year is back').toBe(2008);
});

test('a photo follows its person: who may add it, who may see it, and when it goes', async () => {
  const nora = browser(demo.app), sophie = browser(demo.app), helen = browser(demo.app), visitor = browser(demo.app);
  await nora.signInAs('nora');
  await sophie.signInAs('sophie');
  await helen.signInAs('helen');
  const leo = demo.idOf('Leo'), elias = demo.idOf('Elias');
  const leafOf = async (who: typeof nora, id: string) => (await who.get('/api/tree')).data.people.find((p: Leaf) => p.id === id);
  const image = Buffer.from(phonePhoto()).toString('base64');

  // Only a signed-in relative can send a photo, and only a photo
  expect((await visitor.post('/api/media', { image })).status).toBe(401);
  expect((await nora.post('/api/media', { image: Buffer.from('not a photo at all').toString('base64') })).status).toBe(400);
  const photo: string = (await nora.post('/api/media', { image })).data.id;
  expect(photo).toMatch(/^[a-f0-9]{32}$/);
  expect((await nora.post('/api/media', { image })).data.id, 'the same picture is kept once').toBe(photo);
  const kept = await demo.app.media.read(photo);
  expect(Buffer.from(kept ?? []).toString('latin1'), 'without where it was taken').not.toMatch(/51\.4545|number 12/);

  // Nora looks after Leo, so she may give him a face. A cousin may not, not even as a suggestion.
  expect((await sophie.edit([{ type: 'person.update', person: leo, set: { portrait: photo } }])).status).toBe(403);
  expect((await nora.edit([{ type: 'person.update', person: leo, set: { portrait: 'f'.repeat(32) } }])).status, 'a photo that was never sent').toBe(400);
  // A photo is never held for review, where nobody could look at it: not beside a change that has to wait, and not when its author asks
  const withMore = await nora.edit([{ type: 'person.update', person: leo, set: { portrait: photo } }, ...rename(demo.idOf('Walter'), 'W')]);
  expect([withMore.status, (await nora.edit(rename(demo.idOf('Walter'), 'W'), { mode: 'dry' })).data.status]).toEqual([403, 'suggested']);
  expect((await nora.edit([{ type: 'person.update', person: leo, set: { portrait: photo } }], { mode: 'suggest' })).status).toBe(403);
  const given = (await nora.edit([{ type: 'person.update', person: leo, set: { portrait: photo } }])).data;
  expect(given.status).toBe('applied');
  expect(given.edit.lines[0].fields, 'history says a photo, not an id').toEqual([{ field: 'portrait', to: 'a photo', was: 'no photo' }]);

  // Relatives see it on the tree and can fetch it. A stranger cannot: Leo is living.
  expect((await leafOf(sophie, leo)).portrait).toBe(photo);
  const fetched = await sophie.get(`/api/people/${leo}/portrait?v=${photo}`);
  expect([fetched.status, fetched.headers.get('content-type')]).toEqual([200, 'image/jpeg']);
  expect(fetched.headers.get('cache-control'), 'never shared between people').toContain('private');
  expect((await visitor.get(`/api/people/${leo}/portrait`)).status).toBe(404);
  expect(JSON.stringify((await visitor.get('/api/tree')).data)).not.toContain(photo);

  // Someone long gone, on a tree that is open: the photo is open with them
  expect((await helen.edit([{ type: 'person.update', person: elias, set: { portrait: photo } }])).data.status).toBe('applied');
  expect((await visitor.get(`/api/people/${elias}/portrait`)).status).toBe(200);
  expect((await leafOf(visitor, elias)).portrait).toBe(photo);

  // Undo takes it off again
  expect((await nora.post(`/api/edits/${given.editId}/revert`)).data.status).toBe('applied');
  expect((await leafOf(nora, leo)).portrait).toBeNull();
  expect((await sophie.get(`/api/people/${leo}/portrait`)).status).toBe(404);

  // A photo nobody uses is removed after a while. One in use never is.
  const spare: string = (await nora.post('/api/media', { image: Buffer.from(phonePhoto(320, 320, 2)).toString('base64') })).data.id;
  expect(await demo.app.media.sweep(), 'nothing fresh is swept').toBe(0);
  await demo.app.db.update(media).set({ createdAt: '2020-01-01T00:00:00.000Z' });
  expect(await demo.app.media.sweep()).toBe(1);
  expect([await demo.app.media.has(spare), await demo.app.media.has(photo)]).toEqual([false, true]);
  expect(await demo.app.media.read(spare)).toBeNull();

  // A person removed for good takes their photo with them
  const kid = (await helen.edit([{ type: 'person.create', ref: '$kid', set: { given: 'Briefly', living: 'no' } }])).data.created.$kid as string;
  const theirs: string = (await helen.post('/api/media', { image: Buffer.from(phonePhoto(320, 320, 3)).toString('base64') })).data.id;
  await helen.edit([{ type: 'person.update', person: kid, set: { portrait: theirs } }]);
  await helen.edit([{ type: 'person.remove', person: kid }]);
  expect(await demo.app.media.has(theirs), 'still there while they are in the compost').toBe(true);
  expect((await helen.post(`/api/compost/${kid}/purge`)).status).toBe(200);
  expect(await demo.app.media.has(theirs)).toBe(false);

  await helen.edit([{ type: 'person.update', person: elias, set: { portrait: null } }]);
});

test('the family in memory matches what is stored, after everything above', async () => {
  const before = demo.app.store.state;
  const count = (state: typeof before) => ({ people: state.people.size, unions: state.unions.size, facts: state.facts.size, memories: state.memories.size });
  const remembered = { counts: count(before), elias: before.people.get(demo.idOf('Elias')), union: before.unions.get(demo.unionOf(demo.idOf('Elias'))) };
  await demo.app.store.load();
  const reloaded = demo.app.store.state;
  expect(count(reloaded)).toEqual(remembered.counts);
  expect(reloaded.people.get(demo.idOf('Elias'))).toEqual(remembered.elias);
  expect(reloaded.unions.get(demo.unionOf(demo.idOf('Elias'))), 'partners and children come back in the same order').toEqual(remembered.union);
});
