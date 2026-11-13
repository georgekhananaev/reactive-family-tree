/*
 * Reactive Family Tree: end-to-end demo server.
 *
 *   node server/main.js            start on http://localhost:4321
 *   node server/main.js --reset    start again from the demo family
 *
 * One process, no installs: Node's own HTTP server and SQLite. It serves the
 * app, the web API, the live update stream and the MCP endpoint.
 */

import { createServer } from 'node:http';
import { mkdirSync, readFile } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRoutes } from './api.js';
import { Auth } from './auth.js';
import { openDatabase, restore } from './db.js';
import { Edits } from './edits.js';
import { HttpError } from './errors.js';
import { Mcp } from './mcp.js';
import { Hub } from './realtime.js';
import { seed } from './seed.js';
import { Store } from './store.js';
import { Views } from './views.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const COOKIE = 'rft_session';
const MAX_BODY = 12 * 1024 * 1024;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.ico': 'image/x-icon',
};
/* Folders the browser may load from, by the first part of the address. */
const STATIC = { core: join(ROOT, 'core') };
const WEB = join(ROOT, 'web');

function readBody(request) {
  return new Promise((done, fail) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        fail(new HttpError(413, 'That is too large to send.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => done(Buffer.concat(chunks).toString('utf8')));
    request.on('error', fail);
  });
}

function cookieOf(request, name) {
  const found = (request.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')).find(([key]) => key === name);
  return found ? decodeURIComponent(found[1] ?? '') : null;
}

function serveFile(response, file) {
  readFile(file, (error, data) => {
    if (error) {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    response.end(data);
  });
}

/* A path inside `folder`, or null if the address tries to climb out of it. */
function inside(folder, relative) {
  const file = normalize(join(folder, relative));
  return file.startsWith(folder) ? file : null;
}

export function start({ port = 4321, dataFile = join(ROOT, 'data', 'family.db'), reset = false, quiet = false } = {}) {
  if (dataFile !== ':memory:') mkdirSync(dirname(dataFile), { recursive: true });
  const db = openDatabase(dataFile);
  const store = new Store(db);
  const hub = new Hub();
  const auth = new Auth(db, store);
  const edits = new Edits(db, store, auth, hub);
  const views = new Views(store, edits);
  const app = { db, store, hub, auth, edits, views, baseUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}` };

  /* Wipe everything and plant the demo family again. */
  app.reset = () => {
    restore(db, {});
    store.load();
    seed(app);
    hub.changed(store.seq);
  };
  if (reset || store.isEmpty) app.reset();

  const mcp = new Mcp(app);
  const routes = buildRoutes(app);
  const sweep = setInterval(() => edits.sweepCompost(), 6 * 3600 * 1000);
  sweep.unref();

  async function handleApi(request, response, url) {
    const sessionToken = cookieOf(request, COOKIE);
    const user = auth.userForSession(sessionToken);
    const send = (status, payload, headers = {}) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
      response.end(JSON.stringify(payload));
    };
    try {
      // A page on another site must not be able to act with this visitor's session
      const origin = request.headers.origin;
      if (request.method !== 'GET' && origin && new URL(origin).host !== request.headers.host) throw new HttpError(403, 'Requests from other sites are not accepted.');

      if (url.pathname === '/api/stream') return hub.attach(response, user?.id ?? null);

      const route = routes.find((candidate) => candidate.method === request.method && candidate.regex.test(url.pathname));
      if (!route) throw new HttpError(404, 'There is nothing at that address.');
      const match = url.pathname.match(route.regex);
      const raw = request.method === 'GET' ? '' : await readBody(request);
      let body = {};
      if (raw) {
        try { body = JSON.parse(raw); } catch { throw new HttpError(400, 'That is not valid JSON.'); }
      }
      const cookies = [];
      const ctx = {
        user, sessionToken, body, query: url.searchParams,
        actor: user ? auth.actorFor(user) : auth.visitor(),
        params: Object.fromEntries(route.keys.map((key, index) => [key, decodeURIComponent(match[index + 1])])),
        startSession: (token) => cookies.push(`${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 86400}`),
        endSession: () => cookies.push(`${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`),
      };
      route.guard(ctx);
      const result = await route.handler(ctx);
      if (result?.download) {
        response.writeHead(200, { 'Content-Type': result.download.type, 'Content-Disposition': `attachment; filename="${result.download.name}"`, 'Cache-Control': 'no-store' });
        return response.end(result.download.body);
      }
      return send(200, result ?? { ok: true }, cookies.length ? { 'Set-Cookie': cookies } : {});
    } catch (error) {
      if (error instanceof HttpError) return send(error.status, { error: error.message, details: error.details });
      console.error(error);
      return send(500, { error: 'Something went wrong on the server.' });
    }
  }

  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) return handleApi(request, response, url);

    if (url.pathname === '/mcp') {
      const body = request.method === 'POST' ? await readBody(request).catch(() => '') : '';
      return mcp.handle({ method: request.method, headers: request.headers, body }, (status, headers, payload) => {
        response.writeHead(status, headers);
        response.end(payload);
      });
    }

    const [, first, ...rest] = url.pathname.split('/');
    const file = STATIC[first] ? inside(STATIC[first], rest.join('/')) : inside(WEB, url.pathname === '/' ? 'index.html' : url.pathname.slice(1));
    return file ? serveFile(response, file) : serveFile(response, join(WEB, 'missing'));
  });

  return new Promise((ready) => {
    server.listen(port, '127.0.0.1', () => {
      const address = `http://localhost:${server.address().port}`;
      if (!process.env.PUBLIC_URL) app.baseUrl = address;
      if (!quiet) console.log(`Reactive Family Tree demo is running at ${address}\nAI clients connect to ${address}/mcp`);
      ready({
        app, url: address,
        close: () => new Promise((closed) => { clearInterval(sweep); hub.close(); server.close(() => { db.close(); closed(); }); server.closeAllConnections(); }),
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start({ port: Number(process.env.PORT ?? 4321), reset: process.argv.includes('--reset'), ...(process.env.DATA_FILE ? { dataFile: process.env.DATA_FILE } : {}) });
}
