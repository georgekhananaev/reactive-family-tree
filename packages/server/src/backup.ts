/*
 * The full backup: every row of the family and its members as one JSON
 * document, and the way back from it. Restoring replaces the whole tree with
 * an identical copy of the backup.
 */

import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

type Row = Record<string, unknown>;

export interface Backup {
  format: typeof FORMAT;
  version: number;
  madeAt: string;
  tables: Record<string, Row[]>;
}

export async function dump(db: Database): Promise<Backup> {
  const tables: Record<string, Row[]> = {};
  for (const table of KEPT) {
    const result = await db.$client.execute(`SELECT * FROM "${table}"`);
    const rows = result.rows.map((row) => Object.fromEntries(result.columns.map((column) => [column, row[column]])));
    tables[table] = table === 'meta' ? rows.filter((row) => !OWN_META.includes(String(row.key))) : rows;
  }
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

const SNAPSHOTS_KEPT = 14;

/* The nightly snapshot: a full backup written beside the database, keeping the last fourteen. */
export async function writeSnapshot(db: Database, folder: string): Promise<string> {
  mkdirSync(folder, { recursive: true });
  const name = `snapshot-${new Date().toISOString().slice(0, 10)}.json`;
  writeFileSync(join(folder, name), JSON.stringify(await dump(db)));
  const old = readdirSync(folder).filter((file) => /^snapshot-\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort().slice(0, -SNAPSHOTS_KEPT);
  for (const file of old) rmSync(join(folder, file));
  return name;
}
