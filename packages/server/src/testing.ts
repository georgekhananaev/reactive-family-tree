/*
 * For tests: a private copy of the demo family in a temporary database, and a
 * "browser" that talks to it the way a real one would, cookies and all,
 * without a web server in between.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Op, TreeSnapshot } from '@reactive-family-tree/core';

import { createApp } from './app';
import type { App } from './app';
import type { AppConfig } from './config';

const BASE = 'http://localhost:3000';

/* An app on a database of its own, in a temporary folder that goes when the test is done. */
export interface Started {
  app: App;
  close(): void;
}

export interface Demo extends Started {
  /* The id of someone in the demo family, by given name. */
  idOf(given: string, family?: string): string;
  /* The partnership a person hosts. */
  unionOf(hostId: string): string;
}

async function start(mode: Pick<AppConfig, 'demoMode' | 'setupToken'>): Promise<Started> {
  const folder = mkdtempSync(join(tmpdir(), 'family-tree-'));
  const app = await createApp({
    baseUrl: BASE, databaseUrl: `file:${join(folder, 'family.db')}`, secret: 'a-secret-only-for-tests-0123456789',
    email: { from: 'Family tree <tree@localhost>' }, media: {}, timers: false, ...mode,
  });
  return {
    app,
    close: () => {
      app.scheduler.stop();
      app.db.$client.close();
      rmSync(folder, { recursive: true, force: true });
    },
  };
}

/* An install that nobody has claimed yet. The setup token is the one its host would have been given. */
export const startFresh = (setupToken: string): Promise<Started> => start({ demoMode: false, setupToken });

export async function startDemo(): Promise<Demo> {
  const { app, close } = await start({ demoMode: true });
  const tree: TreeSnapshot = await app.views.tree(app.members.system());
  const find = <T>(found: T | undefined, what: string): T => {
    if (found === undefined) throw new Error(`The demo family has no ${what}.`);
    return found;
  };
  return {
    app,
    close,
    idOf: (given, family) => find(tree.people.find((p) => !p.masked && p.given === given && (!family || p.family === family)), given).id,
    unionOf: (hostId) => find(tree.unions.find((union) => union.host === hostId), `partnership hosted by ${hostId}`).id,
  };
}

export interface Answer {
  status: number;
  /* The parsed JSON, or the text of a download. Loosely typed on purpose: tests read into it freely. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  headers: Headers;
}

export interface Browser {
  get(path: string): Promise<Answer>;
  post(path: string, body?: unknown): Promise<Answer>;
  patch(path: string, body: unknown): Promise<Answer>;
  del(path: string): Promise<Answer>;
  signInAs(name: string): Promise<Answer>;
  edit(ops: Op[], extra?: Record<string, unknown>): Promise<Answer>;
  /* Ask for every answer in this language, as the app does once someone has chosen one. Null stops asking. */
  reads(lang: string | null): void;
  /* Set a cookie by hand, as a page does. */
  remember(name: string, value: string | null): void;
}

/* One browser: remembers its session cookie between requests. */
/* `from` is the address on the network the browser is at, as a proxy in front of the tree would report it. `speaks` is what its device says about languages. */
export function browser(app: App, from?: string, speaks?: string): Browser {
  const cookies = new Map<string, string>();
  let asking: string | null = null;
  async function call(method: string, path: string, body?: unknown): Promise<Answer> {
    const headers = new Headers({ host: new URL(BASE).host });
    if (from) headers.set('x-forwarded-for', from);
    if (speaks) headers.set('accept-language', speaks);
    if (asking) headers.set('x-language', asking);
    if (method !== 'GET') headers.set('origin', BASE);
    if (body !== undefined) headers.set('content-type', 'application/json');
    if (cookies.size) headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    const request = new Request(BASE + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    // Signing in belongs to the sign-in library, everything else to the web API
    const response = await (path.startsWith('/api/auth/') ? app.auth.handler(request) : app.handle(request));
    for (const line of response.headers.getSetCookie()) {
      const [pair = ''] = line.split(';');
      const at = pair.indexOf('=');
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      if (value && !/max-age=0/i.test(line)) cookies.set(name, value);
      else cookies.delete(name);
    }
    const text = await response.text();
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* a download, or a redirect */ }
    return { status: response.status, data, headers: response.headers };
  }
  return {
    get: (path) => call('GET', path),
    post: (path, body = {}) => call('POST', path, body),
    patch: (path, body) => call('PATCH', path, body),
    del: (path) => call('DELETE', path),
    signInAs: (name) => call('POST', '/api/auth/family/demo-sign-in', { email: `${name}@marlow.example` }),
    edit: (ops, extra = {}) => call('POST', '/api/edits', { ops, message: 'test', ...extra }),
    reads: (lang) => { asking = lang; },
    remember: (name, value) => { if (value === null) cookies.delete(name); else cookies.set(name, value); },
  };
}
