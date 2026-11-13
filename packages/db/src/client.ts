/*
 * The database: libSQL. One file when self-hosted, Turso when deployed to a
 * serverless host, and the same code either way.
 */

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { createClient } from '@libsql/client';
import type { Client, Transaction } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

import * as authSchema from './auth-schema';
import { MIGRATIONS } from './migrations.generated';
import * as familySchema from './schema';

export const schema = { ...authSchema, ...familySchema };

export type Database = LibSQLDatabase<typeof schema> & { $client: Client };
/* A database, or a transaction on one: what a query may run on. */
export type Queryable = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'run' | 'all' | 'get' | 'values'>;

export interface DatabaseOptions {
  /* "file:./data/family.db", "libsql://…" for Turso, or ":memory:". */
  url: string;
  authToken?: string;
}

const BUSY_TIMEOUT_MS = 5000;

/*
 * A local database file is read and written on this one thread, so two parts
 * of the app must never wait on each other's lock: the one waiting would stop
 * the one that could let go. Here everything takes its turn instead. A query
 * runs when those before it have finished, and a transaction keeps the turn
 * until it is committed or rolled back.
 *
 * Inside a transaction, use the transaction. A query sent to the database
 * itself from there would wait for the transaction that is waiting for it.
 */
function inTurn(client: Client): Client {
  let last: Promise<unknown> = Promise.resolve();
  const next = <T>(work: () => Promise<T>): Promise<T> => {
    const run = last.then(work, work);
    last = run.catch(() => {});
    return run;
  };
  const queries = new Set<PropertyKey>(['execute', 'batch', 'migrate', 'executeMultiple']);

  return new Proxy(client, {
    get(target, key) {
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== 'function') return value;
      const call = (args: unknown[]) => value.apply(target, args) as Promise<unknown>;
      if (queries.has(key)) return (...args: unknown[]) => next(() => call(args));
      if (key !== 'transaction') return value.bind(target);
      return (...args: unknown[]) =>
        new Promise((resolve, reject) => {
          void next(() => new Promise<void>((ended) => {
            call(args).then((opened) => {
              const tx = opened as Transaction;
              for (const name of ['commit', 'rollback'] as const) {
                const settle = tx[name].bind(tx);
                tx[name] = () => settle().finally(ended);
              }
              resolve(tx);
            }, (error: unknown) => {
              ended();
              reject(error);
            });
          }));
        });
    },
  });
}

export function openDatabase({ url, authToken }: DatabaseOptions): Database {
  if (!url.startsWith('file:')) return drizzle(createClient({ url, authToken }), { schema });
  mkdirSync(dirname(url.slice('file:'.length)), { recursive: true });
  // The timeout is for another process that has the same file open
  return drizzle(inTurn(createClient({ url, concurrency: 1, timeout: BUSY_TIMEOUT_MS })), { schema });
}

/*
 * Bring the database up to date. Each migration runs once, in order, inside a
 * transaction, and is remembered by name. The SQL is bundled into the code, so
 * this works the same from a container, a serverless function or a test.
 */
export async function migrate(db: Database): Promise<string[]> {
  const client = db.$client;
  // With a write-ahead log, someone reading never holds up someone writing. The setting stays with the file.
  if (client.protocol === 'file') await client.execute('PRAGMA journal_mode = WAL');
  await client.execute('CREATE TABLE IF NOT EXISTS __migration (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((await client.execute('SELECT name FROM __migration')).rows.map((row) => String(row.name)));
  const applied: string[] = [];
  for (const migration of MIGRATIONS) {
    if (done.has(migration.name)) continue;
    await client.batch(
      [
        ...migration.statements,
        { sql: 'INSERT INTO __migration (name, applied_at) VALUES (?, ?)', args: [migration.name, new Date().toISOString()] },
      ],
      'write',
    );
    applied.push(migration.name);
  }
  return applied;
}
