/*
 * The family's journeys, end to end over HTTP against a real server:
 * who sees what, who may change what, suggestions and review, undo, drafts
 * from an AI client, and data in and out.
 */

import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';

import { aiClient, browser, startDemo } from './helpers.js';

let demo;
before(async () => { demo = await startDemo(); });
after(() => demo.close());

const rename = (person, given) => [{ type: 'person.update', person, set: { given } }];
const newChild = (union, given) => [
  { type: 'person.create', ref: '$kid', set: { given, family: 'Test', living: 'yes' } },
  { type: 'fact.add', subject: { type: 'person', id: '$kid' }, set: { type: 'birth', date: { kind: 'exact', from: '2020' } } },
  { type: 'child.link', union, child: '$kid' },
];

test('a visitor sees the shape of the tree but nothing about the living', async () => {
  const visitor = browser(demo.url);
  const { data: tree } = await visitor.get('/api/tree');
  const masked = tree.people.filter((p) => p.masked);
  assert.equal(tree.people.length, 50);
  assert.equal(masked.length, 39);
  for (const p of masked) assert.deepEqual(Object.keys(p).sort(), ['id', 'masked'], 'a masked person carries nothing but a placeholder');
  assert.ok(tree.people.some((p) => p.given === 'Elias'), 'people who have died are shown');
  assert.ok(!JSON.stringify(tree).includes('Sophie'), 'no living name anywhere in what a visitor receives');

  assert.equal((await visitor.get(`/api/people/${demo.idOf('Sophie')}`)).status, 404);
  assert.equal((await visitor.get('/api/people?q=sophie')).data.people.length, 0);
  assert.equal((await visitor.get('/api/people?q=elias')).data.people.length, 1);
  assert.equal((await visitor.get('/api/edits?which=activity')).status, 401);
  assert.equal((await visitor.get('/api/members')).status, 401);
});

test('a private tree shows a visitor nothing at all', async () => {
  const owner = browser(demo.url);
  await owner.signInAs('helen');
  await owner.patch('/api/settings', { visibility: 'private' });
  const visitor = browser(demo.url);
  const { data: tree } = await visitor.get('/api/tree');
  assert.equal(tree.closed, true);
  assert.equal(tree.people.length, 0);
  assert.equal((await visitor.get(`/api/people/${demo.idOf('Elias')}`)).status, 403);
  await owner.patch('/api/settings', { visibility: 'public_masked' });
});

test('edits inside your branch publish at once, edits elsewhere become suggestions', async () => {
  const margaret = browser(demo.url);
  await margaret.signInAs('margaret');
  const before = (await margaret.get('/api/tree')).data;

  const inside = await margaret.edit(newChild(demo.unionOf(demo.idOf('Clara')), 'Robin'));
  assert.equal(inside.data.status, 'applied');
  const tree = (await margaret.get('/api/tree')).data;
  assert.equal(tree.seq, before.seq + 1);
  assert.ok(tree.people.some((p) => p.given === 'Robin' && !p.pending));

  const outside = await margaret.edit(rename(demo.idOf('Walter'), 'Walt'));
  assert.equal(outside.data.status, 'suggested');
  assert.equal((await margaret.get('/api/tree')).data.seq, tree.seq, 'a suggestion does not change the tree');
  // the button label is known in advance
  assert.equal((await margaret.edit(rename(demo.idOf('Walter'), 'W'), { mode: 'dry' })).data.status, 'suggested');
  assert.equal((await margaret.edit(rename(demo.idOf('Clara'), 'Clara'), { mode: 'dry' })).data.status, 'applied');

  const daniel = browser(demo.url);
  await daniel.signInAs('daniel');
  assert.equal((await daniel.edit(rename(demo.idOf('Daniel'), 'Dan'))).data.status, 'applied', 'a member can always edit their own leaf');
  assert.equal((await daniel.edit(rename(demo.idOf('Nora'), 'N'))).data.status, 'suggested');
  await daniel.edit(rename(demo.idOf('Daniel'), 'Daniel'));
});

test('a suggestion reaches the right reviewers and is approved, adjusted or declined', async () => {
  const karl = browser(demo.url);
  await karl.signInAs('karl');
  const queue = (await karl.get('/api/edits?which=review')).data.edits;
  assert.deepEqual(queue.map((e) => e.message), ['Add Lena, Karl and Ines’s youngest'], 'a steward reviews only what lands in his branch');
  assert.ok((await karl.get('/api/tree')).data.people.some((p) => p.given === 'Lena' && p.pending), 'shown on his tree in pencil');

  const sophie = browser(demo.url);
  await sophie.signInAs('sophie');
  assert.equal((await sophie.post(`/api/edits/${queue[0].id}/review`, { action: 'approve' })).status, 403, 'you cannot approve your own suggestion');

  const approved = await karl.post(`/api/edits/${queue[0].id}/review`, { action: 'approve' });
  assert.equal(approved.data.status, 'applied');
  assert.equal(approved.data.edit.author, 'Sophie Stein', 'credit stays with the person who suggested it');
  assert.equal(approved.data.edit.reviewedBy, 'Karl Lindqvist');
  assert.ok((await sophie.get('/api/tree')).data.people.some((p) => p.given === 'Lena' && !p.pending));
  assert.ok((await sophie.get('/api/notifications')).data.notifications.some((n) => n.kind === 'approved'));

  const peter = browser(demo.url);
  await peter.signInAs('peter');
  const forAdmin = (await peter.get('/api/edits?which=review')).data.edits;
  const birthday = forAdmin.find((e) => e.message.startsWith('Edith'));
  assert.equal(birthday.lines[0].fields[0].was, '1930');
  assert.equal(birthday.lines[0].fields[0].to, '12 May 1930');
  assert.equal((await peter.post(`/api/edits/${birthday.id}/review`, { action: 'decline' })).status, 400, 'declining needs a reason');
  const declined = await peter.post(`/api/edits/${birthday.id}/review`, { action: 'decline', note: 'The parish record says 14 May.' });
  assert.equal(declined.data.status, 'declined');

  const walter = forAdmin.find((e) => e.lines[0].text.includes('Walter'));
  const adjusted = await peter.post(`/api/edits/${walter.id}/review`, { action: 'approve', ops: rename(demo.idOf('Walter'), 'Walter J.') });
  assert.equal(adjusted.data.status, 'applied');
  assert.equal((await peter.get(`/api/people/${demo.idOf('Walter')}`)).data.given, 'Walter J.');
});

test('every edit can be undone, and undo refuses to trample later changes', async () => {
  const peter = browser(demo.url);
  await peter.signInAs('peter');
  const first = await peter.edit(rename(demo.idOf('Hana'), 'Hanako'));
  const second = await peter.edit(rename(demo.idOf('Hana'), 'Hanna'));

  const blocked = await peter.post(`/api/edits/${first.data.editId}/revert`);
  assert.equal(blocked.status, 409, 'a later edit changed the same person');
  assert.equal((await peter.post(`/api/edits/${second.data.editId}/revert`)).data.status, 'applied');
  assert.equal((await peter.post(`/api/edits/${first.data.editId}/revert`)).data.status, 'applied');
  assert.equal((await peter.get(`/api/people/${demo.idOf('Hana')}`)).data.given, 'Hana');

  const history = (await peter.get(`/api/edits?which=activity&person=${demo.idOf('Hana')}`)).data.edits;
  assert.equal(history.filter((e) => e.status === 'reverted').length, 2, 'nothing is erased from history');
  assert.equal(history.filter((e) => e.message.startsWith('Undo')).length, 2);
});

test('edits that break the family are refused with a reason', async () => {
  const peter = browser(demo.url);
  await peter.signInAs('peter');
  const dead = await peter.edit([{ type: 'fact.add', subject: { type: 'person', id: demo.idOf('Sophie') }, set: { type: 'death', date: { kind: 'exact', from: '1950' } } }]);
  assert.equal(dead.status, 422);
  assert.match(dead.data.error, /cannot have died/);

  const loop = await peter.edit([{ type: 'child.link', union: demo.unionOf(demo.idOf('Clara')), child: demo.idOf('Margaret') }]);
  assert.equal(loop.status, 422);
  assert.match(loop.data.error, /own ancestor/);
  assert.equal((await peter.edit([{ type: 'person.update', person: demo.idOf('Sophie'), set: { sex: 'robot' } }])).status, 422);
});

test('only a living person can make themselves public', async () => {
  const helen = browser(demo.url);
  await helen.signInAs('helen');
  const sophieId = demo.idOf('Sophie');
  const refused = await helen.edit([{ type: 'person.update', person: sophieId, set: { privacy: 'public' } }]);
  assert.equal(refused.status, 403);
  await helen.patch('/api/settings', { visibility: 'public' });

  const visitor = browser(demo.url);
  assert.equal((await visitor.get(`/api/people/${sophieId}`)).status, 404);
  const sophie = browser(demo.url);
  await sophie.signInAs('sophie');
  assert.equal((await sophie.edit([{ type: 'person.update', person: sophieId, set: { privacy: 'public' } }])).data.status, 'applied');
  assert.equal((await visitor.get(`/api/people/${sophieId}`)).data.name, 'Sophie Stein');

  await sophie.edit([{ type: 'person.update', person: sophieId, set: { privacy: 'default' } }]);
  assert.equal((await visitor.get(`/api/people/${sophieId}`)).status, 404, 'consent ends when she changes her mind');
  await helen.patch('/api/settings', { visibility: 'public_masked' });
});

test('removing goes to the compost, and restoring brings a person back', async () => {
  const nora = browser(demo.url);
  await nora.signInAs('nora');
  const leo = demo.idOf('Leo');
  assert.equal((await nora.edit([{ type: 'person.remove', person: leo }])).data.status, 'applied');
  assert.ok(!(await nora.get('/api/tree')).data.people.some((p) => p.id === leo));
  assert.equal((await nora.edit([{ type: 'person.remove', person: demo.idOf('Sam') }])).data.status, 'suggested', 'someone with children needs an admin');

  const helen = browser(demo.url);
  await helen.signInAs('helen');
  assert.ok((await helen.get('/api/compost')).data.people.some((p) => p.id === leo));
  assert.equal((await helen.edit([{ type: 'person.restore', person: leo }])).data.status, 'applied');
  assert.ok((await nora.get('/api/tree')).data.people.some((p) => p.id === leo));
  assert.equal((await nora.get('/api/compost')).status, 403);
});

test('an AI draft is private until its owner applies it, whole or in part', async () => {
  const margaret = browser(demo.url);
  await margaret.signInAs('margaret');
  const drafts = (await margaret.get('/api/edits?which=mine')).data.edits.filter((e) => e.status === 'draft');
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].origin, 'mcp');
  assert.equal(drafts[0].client, 'Claude on my laptop');
  assert.ok((await margaret.get('/api/tree')).data.people.some((p) => p.given === 'Juno' && p.pending?.status === 'draft'));

  const helen = browser(demo.url);
  await helen.signInAs('helen');
  assert.ok(!(await helen.get('/api/tree')).data.people.some((p) => p.given === 'Juno'), 'nobody else sees a draft, not even the owner of the tree');
  assert.equal((await helen.get(`/api/edits/${drafts[0].id}`)).status, 404);

  // apply only the link of the baby: the baby and nothing else comes along, the birthday fix stays in the draft
  const part = await margaret.post(`/api/edits/${drafts[0].id}/apply`, { indexes: [2] });
  assert.equal(part.data.status, 'applied');
  assert.equal(part.data.remaining, 2);
  assert.ok((await helen.get('/api/tree')).data.people.some((p) => p.given === 'Juno' && !p.pending));
  const rest = await margaret.post(`/api/edits/${drafts[0].id}/apply`, {});
  assert.equal(rest.data.status, 'applied');
  assert.equal(rest.data.remaining, 0);
  assert.equal(rest.data.edit.origin, 'mcp', 'history remembers it came from an AI');
});

test('an AI client can do what its owner can, and arrives as a draft by default', async () => {
  assert.equal((await aiClient(demo.url, 'rft_wrong').rpc('tools/list')).status, 401);

  const nora = browser(demo.url);
  await nora.signInAs('nora');
  const careful = (await nora.post('/api/connections', { name: 'Careful', mode: 'review_first' })).data;
  const ai = aiClient(demo.url, careful.token);

  const hello = await ai.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  assert.equal(hello.body.result.protocolVersion, '2025-06-18');
  assert.match(hello.body.result.instructions, /Never invent/);
  const tools = (await ai.rpc('tools/list')).body.result.tools.map((t) => t.name);
  assert.ok(tools.includes('add_person') && tools.includes('apply_edit'));
  assert.ok(!tools.includes('review_suggestion'), 'admin tools are not offered to a member');

  const me = await ai.tool('whoami');
  assert.equal(me.data.member, 'Nora Bell');
  const found = await ai.tool('search_people', { query: 'iris' });
  assert.equal(found.data.people[0].name, 'Iris Bell');

  const added = await ai.tool('add_person', { relative_of: demo.idOf('Nora'), relation: 'child', given: 'Pip', family: 'Bell', born: 'about 2010' });
  assert.equal(added.data.status, 'draft');
  assert.ok(!(await nora.get('/api/tree')).data.people.some((p) => p.given === 'Pip' && !p.pending), 'not on the tree until Nora says so');
  assert.equal((await nora.post(`/api/edits/${added.data.edit_id}/apply`, {})).data.status, 'applied');

  const invented = await ai.tool('add_fact', { person: demo.idOf('Iris'), type: 'death', date: '1990' });
  assert.equal(invented.isError, true, 'the same checks apply to an AI');
  assert.match(invented.data, /cannot have died/);

  // a connection set to apply directly: publishes inside her branch, suggests outside it
  const direct = (await nora.post('/api/connections', { name: 'Direct', mode: 'apply_directly' })).data;
  const bold = aiClient(demo.url, direct.token);
  assert.equal((await bold.tool('update_person', { person: demo.idOf('Iris'), bio: 'Plays the cello.' })).data.status, 'applied');
  assert.equal((await bold.tool('update_person', { person: demo.idOf('Edith'), bio: 'x' })).data.status, 'suggested');
  const outline = await bold.tool('get_family', { person: demo.idOf('Nora'), depth: 2 });
  assert.match(outline.data, /Nora Bell born Okafor \(1975\).*\+ Sam Bell/);
  assert.match((await bold.rpc('resources/read', { uri: 'tree://guidelines' })).body.result.contents[0].text, /Never guess/);
  assert.equal((await bold.rpc('prompts/list')).body.result.prompts.length, 4);

  // read-only connections cannot change anything, revoked ones cannot connect
  const reader = (await nora.post('/api/connections', { name: 'Reader', access: 'read' })).data;
  const readOnly = aiClient(demo.url, reader.token);
  assert.ok(!(await readOnly.rpc('tools/list')).body.result.tools.some((t) => t.name === 'add_person'));
  assert.ok((await readOnly.tool('add_person', { relative_of: demo.idOf('Nora'), relation: 'child', given: 'X' })).rpcError);
  await nora.del(`/api/connections/${reader.id}`);
  assert.equal((await readOnly.rpc('tools/list')).status, 401);
  assert.equal((await nora.post('/api/connections', { name: 'Sneaky', access: 'admin' })).status, 403);
});

test('invitations and magic links work once', async () => {
  const helen = browser(demo.url);
  await helen.signInAs('helen');
  const invite = (await helen.post('/api/invites', { email: 'elin@marlow.example', personId: demo.idOf('Elin'), role: 'member', grantBranch: true })).data;
  const token = new URL(invite.link).searchParams.get('invite');

  const elin = browser(demo.url);
  assert.equal((await elin.get(`/api/invites/open?token=${token}`)).data.personName, 'Elin Lindqvist');
  assert.equal((await elin.post('/api/invites/accept', { token, name: 'Elin Lindqvist', email: 'elin@marlow.example' })).status, 200);
  const session = (await elin.get('/api/session')).data;
  assert.equal(session.user.personId, demo.idOf('Elin'));
  assert.deepEqual(session.user.anchors, [demo.idOf('Elin')], 'invited as herself, she looks after her own branch');
  assert.equal((await browser(demo.url).post('/api/invites/accept', { token, name: 'Mallory', email: 'm@example.com' })).status, 400);

  const link = (await browser(demo.url).post('/api/auth/link', { email: 'elin@marlow.example' })).data.demoLink;
  const signin = new URL(link).searchParams.get('signin');
  const again = browser(demo.url);
  assert.equal((await again.post('/api/auth/redeem', { token: signin })).status, 200);
  assert.equal((await again.get('/api/session')).data.user.name, 'Elin Lindqvist');
  assert.equal((await browser(demo.url).post('/api/auth/redeem', { token: signin })).status, 400, 'a link works once');
  assert.equal((await browser(demo.url).post('/api/auth/link', { email: 'nobody@example.com' })).data.demoLink, null);

  // stewards invite within their branch only, and only an owner makes owners
  const karl = browser(demo.url);
  await karl.signInAs('karl');
  assert.equal((await karl.post('/api/invites', { personId: demo.idOf('Vera') })).status, 200);
  assert.equal((await karl.post('/api/invites', { personId: demo.idOf('Iris') })).status, 403);
  const peter = browser(demo.url);
  await peter.signInAs('peter');
  const members = (await peter.get('/api/members')).data.members;
  assert.equal((await peter.patch(`/api/members/${members.find((m) => m.name === 'Karl Lindqvist').id}`, { role: 'owner' })).status, 403);
  assert.equal((await helen.patch(`/api/members/${members.find((m) => m.role === 'owner').id}`, { role: 'member' })).status, 400, 'a tree always has an owner');
});

test('the family can leave with all its data, and come back', async () => {
  const helen = browser(demo.url);
  await helen.signInAs('helen');
  const gedcom = (await helen.get('/api/export/gedcom')).data;
  assert.match(gedcom, /1 NAME Ada \/Finch\//);
  assert.match(gedcom, /2 DATE ABT 1955/);
  const people = (await helen.get('/api/tree')).data.people.length;
  assert.equal(gedcom.match(/ INDI$/gm).length, people);

  // importing stages a draft the admin previews before anything is written
  const staged = (await helen.post('/api/import/gedcom', { text: gedcom })).data;
  assert.equal(staged.status, 'draft');
  assert.equal(staged.people, people);
  assert.equal((await helen.get('/api/tree')).data.people.filter((p) => !p.pending).length, people);
  assert.ok(staged.warnings.some((w) => w.code === 'possible_duplicate'), 'importing the same family again is noticed');
  await helen.post(`/api/edits/${staged.editId}/discard`);

  const backup = (await helen.get('/api/export/backup')).data;
  assert.equal(backup.format, 'reactive-family-tree-backup');
  await helen.edit(rename(demo.idOf('Marta'), 'Changed'));
  assert.equal((await browser(demo.url).post('/api/import/backup', { backup })).status, 401);
  assert.equal((await helen.post('/api/import/backup', { backup })).status, 200);
  await helen.signInAs('helen');
  assert.equal((await helen.get(`/api/people/${demo.idOf('Marta')}`)).data.given, 'Marta');
  assert.equal((await helen.patch('/api/settings', { livingAge: 5 })).status, 400);
});
