/* Starts a private copy of the demo server in memory and talks to it the way a browser would. */

import { start } from '../server/main.js';

export async function startDemo() {
  const server = await start({ port: 0, dataFile: ':memory:', quiet: true });
  const tree = server.app.views.tree(server.app.auth.system());
  const idOf = (given, family) => tree.people.find((p) => p.given === given && (!family || p.family === family)).id;
  const unionOf = (hostId) => tree.unions.find((u) => u.host === hostId).id;
  return { ...server, idOf, unionOf };
}

/* One browser: remembers its session cookie between requests. */
export function browser(baseUrl) {
  let cookie = '';
  async function call(method, path, body) {
    const response = await fetch(baseUrl + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const set = response.headers.getSetCookie();
    if (set.length) cookie = set.map((line) => line.split(';')[0]).join('; ');
    const text = await response.text();
    let data = text;
    try { data = JSON.parse(text); } catch { /* a download */ }
    return { status: response.status, data };
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    del: (path) => call('DELETE', path),
    signInAs: (name) => call('POST', '/api/auth/demo', { email: `${name}@marlow.example` }),
    edit: (ops, extra = {}) => call('POST', '/api/edits', { ops, message: 'test', ...extra }),
  };
}

/* An AI client holding a token. */
export function aiClient(baseUrl, token) {
  let nextId = 1;
  async function rpc(method, params) {
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    });
    return { status: response.status, body: await response.json() };
  }
  return {
    rpc,
    async tool(name, args = {}) {
      const { body } = await rpc('tools/call', { name, arguments: args });
      const result = body.result;
      return { isError: Boolean(result?.isError), data: result?.structuredContent ?? result?.content?.[0]?.text, rpcError: body.error ?? null };
    },
  };
}
