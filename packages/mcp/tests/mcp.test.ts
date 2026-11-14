/*
 * An AI client talking to the tree over MCP: what it is offered, that it can do
 * what its owner can and no more, and that its changes arrive as a draft by default.
 */

import { createHash, randomBytes } from 'node:crypto';

import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { browser, startDemo } from '@reactive-family-tree/server/testing';
import type { Demo } from '@reactive-family-tree/server/testing';
import { afterAll, beforeAll, expect, test } from 'vitest';

import release from '../package.json';
import { createMcpEndpoint } from '../src';

let demo: Demo;
let endpoint: (request: Request) => Promise<Response>;
beforeAll(async () => {
  demo = await startDemo();
  endpoint = createMcpEndpoint(demo.app);
});
afterAll(() => demo.close());

interface Rpc {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

/* An AI client holding a token, speaking JSON-RPC as the protocol's older revisions do. */
function aiClient(token: string | null) {
  let nextId = 1;
  async function rpc(method: string, params: unknown = {}): Promise<Rpc> {
    const response = await endpoint(new Request('http://localhost:3000/mcp', {
      method: 'POST',
      headers: { host: 'localhost:3000', 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }));
    const text = await response.text();
    // The answer comes as plain JSON or as one event on a stream
    const payload = response.headers.get('content-type')?.includes('text/event-stream') ? text.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).at(-1) ?? '' : text;
    let body: unknown = null;
    try { body = JSON.parse(payload); } catch { /* an empty answer */ }
    return { status: response.status, body };
  }
  return {
    rpc,
    async tool(name: string, args: Record<string, unknown> = {}) {
      const { body } = await rpc('tools/call', { name, arguments: args });
      const result = body?.result;
      return { isError: Boolean(result?.isError), data: result?.structuredContent ?? result?.content?.[0]?.text, rpcError: body?.error ?? null };
    },
  };
}

test('a wrong token is turned away', async () => {
  expect((await aiClient('rft_wrong').rpc('tools/list')).status).toBe(401);
  expect((await aiClient(null).rpc('tools/list')).status).toBe(401);
  const get = await endpoint(new Request('http://localhost:3000/mcp', { method: 'GET', headers: { host: 'localhost:3000' } }));
  expect(get.status).toBe(405);
});

test('an AI client can do what its owner can, and arrives as a draft by default', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const careful = (await nora.post('/api/connections', { name: 'Careful', mode: 'review_first' })).data;
  const ai = aiClient(careful.token);

  const hello = await ai.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  expect(hello.body.result.protocolVersion).toBe('2025-06-18');
  expect(hello.body.result.instructions).toMatch(/Never invent/);
  const tools: string[] = (await ai.rpc('tools/list')).body.result.tools.map((t: { name: string }) => t.name);
  expect(tools).toContain('add_person');
  expect(tools).toContain('apply_edit');
  expect(tools, 'admin tools are not offered to a member').not.toContain('review_suggestion');
  expect(tools.length).toBe(22);

  const me = await ai.tool('whoami');
  expect(me.data.member).toBe('Nora Bell');
  const found = await ai.tool('search_people', { query: 'iris' });
  expect(found.data.people[0].name).toBe('Iris Bell');

  const added = await ai.tool('add_person', { relative_of: demo.idOf('Nora'), relation: 'child', given: 'Pip', family: 'Bell', born: 'about 2010' });
  expect(added.data.status).toBe('draft');
  expect(added.data.review_url).toContain('#edit=');
  const onTree = (await nora.get('/api/tree')).data.people as { given?: string; pending?: unknown }[];
  expect(onTree.some((p) => p.given === 'Pip' && !p.pending), 'not on the tree until Nora says so').toBe(false);
  expect((await nora.post(`/api/edits/${added.data.edit_id}/apply`, {})).data.status).toBe('applied');

  const invented = await ai.tool('add_fact', { person: demo.idOf('Iris'), type: 'death', date: '1990' });
  expect(invented.isError, 'the same checks apply to an AI').toBe(true);
  expect(invented.data).toMatch(/cannot have died/);
});

test('a connection set to apply directly publishes inside the branch and suggests outside it', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const direct = (await nora.post('/api/connections', { name: 'Direct', mode: 'apply_directly' })).data;
  const bold = aiClient(direct.token);
  expect((await bold.tool('update_person', { person: demo.idOf('Iris'), bio: 'Plays the cello.' })).data.status).toBe('applied');
  expect((await bold.tool('update_person', { person: demo.idOf('Edith'), bio: 'x' })).data.status).toBe('suggested');
  const outline = await bold.tool('get_family', { person: demo.idOf('Nora'), depth: 2 });
  expect(outline.data).toMatch(/Nora Bell born Okafor \(1975\).*\+ Sam Bell/);
  expect((await bold.rpc('resources/read', { uri: 'tree://guidelines' })).body.result.contents[0].text).toMatch(/Never guess/);
  expect((await bold.rpc('resources/read', { uri: `tree://person/${demo.idOf('Iris')}` })).body.result.contents[0].text).toContain('Plays the cello.');
  expect((await bold.rpc('prompts/list')).body.result.prompts.length).toBe(4);
  const batch = await bold.tool('apply_edit', { message: 'A cousin', dry_run: true, operations: [{ type: 'person.update', person: demo.idOf('Leo'), set: { bio: 'Likes maps.' } }] });
  expect(batch.data.status, 'a dry run says what would happen and changes nothing').toBe('applied');
});

test('read-only connections cannot change anything, and revoked ones cannot connect', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const reader = (await nora.post('/api/connections', { name: 'Reader', access: 'read' })).data;
  const readOnly = aiClient(reader.token);
  const offered: { name: string }[] = (await readOnly.rpc('tools/list')).body.result.tools;
  expect(offered.some((t) => t.name === 'add_person')).toBe(false);
  const tried = await readOnly.tool('add_person', { relative_of: demo.idOf('Nora'), relation: 'child', given: 'X' });
  expect(tried.rpcError || tried.isError, 'a tool that is not offered cannot be called').toBeTruthy();
  await nora.del(`/api/connections/${reader.id}`);
  expect((await readOnly.rpc('tools/list')).status).toBe(401);
  expect((await nora.post('/api/connections', { name: 'Sneaky', access: 'admin' })).status).toBe(403);
});

test('a small local model is offered the simple set of tools, and an admin connection the admin ones', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const small = (await nora.post('/api/connections', { name: 'Small', profile: 'simple' })).data;
  const simple: string[] = (await aiClient(small.token).rpc('tools/list')).body.result.tools.map((t: { name: string }) => t.name);
  expect(simple.sort()).toEqual(['add_fact', 'add_person', 'connect_people', 'get_family', 'get_person', 'search_people', 'suggest_correction', 'update_person', 'whoami']);

  const peter = browser(demo.app);
  await peter.signInAs('peter');
  const keeper = (await peter.post('/api/connections', { name: 'Keeper', access: 'admin', mode: 'apply_directly' })).data;
  const admin = aiClient(keeper.token);
  const all: string[] = (await admin.rpc('tools/list')).body.result.tools.map((t: { name: string }) => t.name);
  expect(all).toContain('review_suggestion');
  expect(all.length, 'everything a member is offered, and the seven admin tools').toBe(29);
  expect(all).toEqual(expect.arrayContaining(['list_translations', 'set_translations']));
  const waiting = await admin.tool('list_suggestions');
  expect(waiting.data.suggestions.length).toBeGreaterThan(0);
});

test('an AI client can sign in for a member instead of carrying a token', async () => {
  const base = 'http://localhost:3000';
  const callback = 'http://127.0.0.1:53999/callback';
  const turnedAway = await endpoint(new Request(`${base}/mcp`, { method: 'POST', headers: { host: 'localhost:3000' } }));
  expect(turnedAway.headers.get('www-authenticate'), 'the refusal says where to sign in').toContain('/.well-known/oauth-protected-resource');

  // From there the client reads which sign-in server guards the tree, and what that server offers
  const guarded = await (await demo.app.auth.handler(new Request(`${base}/.well-known/oauth-protected-resource/mcp`))).json() as { authorization_servers: string[] };
  expect(guarded.authorization_servers).toEqual([`${base}/api/auth`]);
  const margaret = browser(demo.app);
  const offered = (await margaret.get('/api/auth/.well-known/oauth-authorization-server')).data;
  expect(offered.registration_endpoint, 'a client may introduce itself').toBe(`${base}/api/auth/oauth2/register`);
  expect(offered.code_challenge_methods_supported).toContain('S256');

  // A desktop client introduces itself without saying what kind of client it is
  const client = (await margaret.post('/api/auth/oauth2/register', {
    client_name: 'Desk helper', redirect_uris: [callback], token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
  })).data;
  expect(client.client_id).toBeTruthy();

  await margaret.signInAs('margaret');
  const verifier = randomBytes(32).toString('base64url');
  const asked = await margaret.get(`/api/auth/oauth2/authorize?${new URLSearchParams({
    response_type: 'code', client_id: client.client_id, redirect_uri: callback, state: 'kept', scope: 'openid offline_access', resource: `${base}/mcp`,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256',
  })}`);
  const consentPage: string = asked.headers.get('location') ?? asked.data.url;
  expect(consentPage, 'the member is asked first').toMatch(/^\/consent\?/);

  const agreed = await margaret.post('/api/auth/oauth2/consent', { accept: true, oauth_query: consentPage.slice(consentPage.indexOf('?') + 1) });
  const back = new URL(agreed.headers.get('location') ?? agreed.data.url);
  expect(back.searchParams.get('state')).toBe('kept');

  // The code is swapped for an access token, sent as a form the way the standard asks
  const granted = await (await demo.app.auth.handler(new Request(`${base}/api/auth/oauth2/token`, {
    method: 'POST',
    headers: { host: 'localhost:3000', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code', code: back.searchParams.get('code') ?? '', redirect_uri: callback, client_id: client.client_id, code_verifier: verifier, resource: `${base}/mcp`,
    }).toString(),
  }))).json() as { access_token: string };
  const ai = aiClient(granted.access_token);
  const who = await ai.tool('whoami');
  expect(who.data.member).toBe('Margaret Hale');
  expect(who.data.changes_arrive_as, 'a client that signed in starts as carefully as one with a token').toMatch(/draft/);

  expect((await aiClient(`${granted.access_token.slice(0, -6)}AAAAAA`).rpc('tools/list')).status, 'a token that was tampered with opens nothing').toBe(401);

  const listed = (await margaret.get('/api/connections')).data.connections;
  expect(listed.some((c: { kind: string; name: string }) => c.kind === 'oauth' && c.name === 'Desk helper'), 'it shows up among her connections, by its own name').toBe(true);
});

test('the official client library connects, and is told the house rules', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const made = (await nora.post('/api/connections', { name: 'Official client' })).data;

  const client = new Client({ name: 'official-client-test', version: '1.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'), {
    requestInit: { headers: { authorization: `Bearer ${made.token}` } },
    // No web server here: the client's requests are handed straight to the endpoint
    fetch: (address, init) => endpoint(new Request(address, init)),
  }));
  expect(client.getServerVersion()?.name).toBe('reactive-family-tree');
  expect(client.getServerVersion()?.version, 'the version it was released as, not one typed in by hand').toBe(release.version);
  expect(client.getInstructions()).toMatch(/Never invent/);

  const { tools } = await client.listTools();
  expect(tools.map((tool) => tool.name)).toContain('whoami');
  const who = await client.callTool({ name: 'whoami', arguments: {} });
  expect(who.structuredContent).toMatchObject({ member: 'Nora Bell', changes_arrive_as: 'a draft the member approves' });
  await client.close();
});

test('an AI reads and writes in any of the three languages, and an admin\u2019s fills in what is missing', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  const direct = aiClient((await nora.post('/api/connections', { name: 'Polyglot', mode: 'apply_directly' })).data.token);
  const iris = demo.idOf('Iris');
  const me = await direct.tool('whoami');
  expect([me.data.languages, me.data.family_language]).toEqual([['en', 'he', 'ru'], 'en']);

  // The member's words written in Hebrew are kept beside the English, and read back in either
  expect((await direct.tool('update_person', { person: iris, given: 'איריס', language: 'he' })).data.status).toBe('applied');
  expect((await direct.tool('get_person', { person: iris, language: 'he' })).data.given).toBe('איריס');
  expect((await direct.tool('get_person', { person: iris })).data.given, 'the member reads English').toBe('Iris');
  const shown = await direct.tool('get_person', { person: iris, language: 'ru' });
  expect(shown.data.words.from, 'not written in Russian: shown as first written').toMatchObject({ given: 'en' });
  expect((await direct.tool('search_people', { query: 'איריס' })).data.people.map((p: { id: string }) => p.id)).toContain(iris);
  expect((await direct.tool('list_translations', { language: 'ru' })).rpcError || (await direct.tool('list_translations', { language: 'ru' })).isError, 'a member\u2019s AI is not offered the translation tools').toBeTruthy();

  // An admin's AI lists what is missing in Russian and writes it
  const peter = browser(demo.app);
  await peter.signInAs('peter');
  const keeper = aiClient((await peter.post('/api/connections', { name: 'Translator', access: 'admin', mode: 'apply_directly' })).data.token);
  const missing = await keeper.tool('list_translations', { language: 'ru', person: iris });
  const given = missing.data.items.find((item: { field: string }) => item.field === 'given');
  expect([given.kind, given.written_in, given.original]).toEqual(['person', 'en', 'Iris']);
  const written = await keeper.tool('set_translations', { language: 'ru', entries: [
    { kind: 'person', id: iris, field: 'given', text: 'Ирис' },
    { kind: 'family', id: 'family', field: 'familyName', text: 'Семья Марлоу' },
  ] });
  expect([written.data.edit.status, written.data.family_words_saved]).toEqual(['applied', ['familyName']]);
  expect((await keeper.tool('get_person', { person: iris, language: 'ru' })).data.given).toBe('Ирис');
  expect((await browser(demo.app, undefined, 'ru').get('/api/session')).data.settings.familyName).toBe('Семья Марлоу');
  expect((await keeper.tool('list_translations', { language: 'ru', person: iris })).data.items.some((item: { field: string }) => item.field === 'given')).toBe(false);
  expect((await keeper.tool('set_translations', { language: 'ru', entries: [{ kind: 'fact', id: 'x', field: 'given', text: 'x' }] })).isError).toBe(true);
});

test('what a member\u2019s AI is offered, and what it calls its edits, are in the member\u2019s language', async () => {
  const nora = browser(demo.app);
  await nora.signInAs('nora');
  await nora.patch('/api/me/language', { language: 'ru' });
  const ai = aiClient((await nora.post('/api/connections', { name: 'Russian', mode: 'apply_directly' })).data.token);
  const prompts: { name: string; description: string }[] = (await ai.rpc('prompts/list')).body.result.prompts;
  expect(prompts.map((prompt) => prompt.name), 'a prompt is called by the same name in every language').toContain('interview_me');
  expect(prompts.every((prompt) => /[а-яё]/.test(prompt.description) && !/[a-z]{4,}/.test(prompt.description))).toBe(true);
  const asked = (await ai.rpc('prompts/get', { name: 'tidy_my_branch' })).body.result.messages[0].content.text;
  expect(asked).toMatch(/list_gaps/);
  expect(asked).toMatch(/[а-яё]{4,}/);

  // The edit is named for the family's history, where relatives read it
  const saved = await ai.tool('update_person', { person: demo.idOf('Iris'), bio: 'Играет на виолончели.' });
  expect(saved.data.status).toBe('applied');
  const history = (await nora.get(`/api/edits?which=activity&person=${demo.idOf('Iris')}`)).data.edits[0];
  expect(history.message).toMatch(/[а-яё]{3,}/);
  expect(history.message).not.toMatch(/Update|Change/);
  await nora.patch('/api/me/language', { language: null });
});

