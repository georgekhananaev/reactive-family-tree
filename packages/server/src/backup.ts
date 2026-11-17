/*
 * The full backup: every row of the family and its members as one JSON
 * document, and the way back from it. Restoring replaces the whole tree with
 * an identical copy of the backup.
 */

import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { Database, InStatement } from '@reactive-family-tree/db';

import { badRequest } from './errors';

const FORMAT = 'reactive-family-tree-backup';
const VERSION = 2;

/* What a backup holds. Photos are files: the backup lists them, and the folder or bucket they are in is backed up beside it. */
const KEPT = ['person', 'family_union', 'union_partner', 'union_child', 'fact', 'memory', 'edit', 'edit_comment', 'notification', 'branch_grant', 'invite', 'join_request', 'ai_connection', 'setting', 'meta', 'media', 'user', 'account', 'passkey'];
/* What is emptied as well when restoring, so that everyone signs in again. */
const DROPPED = ['session', 'verification', 'oauthAccessToken', 'oauthRefreshToken', 'oauthConsent', 'oauthClientResource', 'oauthClient', 'oauthClientAssertion'];
/* Kept by this install for itself. They never leave in a backup and are never overwritten by one. */
const OWN_META = ['auth_secret', 'setup_token_hash'];
/* What a table holds that is a key to somewhere else: here, what Google handed over when a member signed in with it. A backup carries none of it. */
const KEYS: Readonly<Record<string, readonly string[]>> = { account: ['accessToken', 'refreshToken', 'idToken'] };

type Row = Record<string, unknown>;

export interface Backup {
  format: typeof FORMAT;
  version: number;
  madeAt: string;
  tables: Record<string, Row[]>;
}

export async function dump(db: Database): Promise<Backup> {
  // Read in one go, so every table is of the same moment: an edit that lands meanwhile is in all of them or in none
  const results = await db.$client.batch(KEPT.map((table) => `SELECT * FROM "${table}"`), 'read');
  const tables: Record<string, Row[]> = {};
  KEPT.forEach((table, index) => {
    const result = results[index];
    if (!result) return;
    const keys = KEYS[table] ?? [];
    const rows = result.rows.map((row) => Object.fromEntries(result.columns.map((column) => [column, keys.includes(column) ? null : row[column]])));
    tables[table] = table === 'meta' ? rows.filter((row) => !OWN_META.includes(String(row.key))) : rows;
  });
  return { format: FORMAT, version: VERSION, madeAt: new Date().toISOString(), tables };
}

/* Replace everything with a backup, in one transaction. */
export async function restore(db: Database, backup: unknown): Promise<void> {
  const given = backup as Partial<Backup> | null;
  if (given?.format !== FORMAT || given.version !== VERSION || !given.tables || typeof given.tables !== 'object') {
    throw badRequest('That is not a backup made by this version of the app.');
  }
  const client = db.$client;
  const statements: InStatement[] = [];
  for (const table of [...DROPPED, ...KEPT]) {
    statements.push(table === 'meta' ? { sql: `DELETE FROM "meta" WHERE key NOT IN (${OWN_META.map(() => '?').join(', ')})`, args: OWN_META } : `DELETE FROM "${table}"`);
  }
  for (const table of KEPT) {
    // Column names come from the file, so only those the table really has are used
    const known = new Set((await client.execute(`PRAGMA table_info("${table}")`)).rows.map((row) => String(row.name)));
    for (const row of given.tables[table] ?? []) {
      if (table === 'meta' && OWN_META.includes(String(row.key))) continue;
      const columns = Object.keys(row).filter((column) => known.has(column));
      if (!columns.length) continue;
      statements.push({
        sql: `INSERT INTO "${table}" (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        args: columns.map((column) => row[column] as string | number | null),
      });
    }
  }
  await client.batch(statements, 'write');
}

/*
 * The copies kept beside the database, and how many of each. The nightly one
 * is named for its day. The one made before a restore is named to the second,
 * so that the night's own never writes over it.
 */
const COPIES = {
  snapshot: { kept: 14, named: /^snapshot-\d{4}-\d{2}-\d{2}\.json$/, stamp: (at: string) => at.slice(0, 10) },
  'before-restore': { kept: 5, named: /^before-restore-[\dT-]+\.json$/, stamp: (at: string) => at.slice(0, 19).replaceAll(':', '-') },
} as const;
const UNFINISHED = '.part';

/* A full backup written beside the database: the nightly snapshot, or the family as it stood before a restore replaced it. */
export async function writeSnapshot(db: Database, folder: string, kind: keyof typeof COPIES = 'snapshot'): Promise<string> {
  const { kept, named, stamp } = COPIES[kind];
  mkdirSync(folder, { recursive: true });
  const name = `${kind}-${stamp(new Date().toISOString())}.json`;
  // Written under another name first, so that a file with a copy's name is always a whole one, even where the disk filled or
  // the server stopped half way. One left over from such a time goes now.
  for (const file of readdirSync(folder)) if (file.endsWith(UNFINISHED)) rmSync(join(folder, file));
  const unfinished = join(folder, name + UNFINISHED);
  writeFileSync(unfinished, JSON.stringify(await dump(db)));
  renameSync(unfinished, join(folder, name));
  const old = readdirSync(folder).filter((file) => named.test(file)).sort().slice(0, -kept);
  for (const file of old) rmSync(join(folder, file));
  return name;
}
