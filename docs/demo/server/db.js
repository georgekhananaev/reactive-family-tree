/*
 * The database: SQLite as shipped with Node, one file, no install.
 *
 * The family itself (people, partnerships, facts, memories) is stored as one
 * JSON document per thing, because all logic about the family lives in the
 * shared operations and never in SQL. Everything around it (accounts,
 * sessions, edits, settings) is ordinary tables.
 */

import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entity (
  kind TEXT NOT NULL, id TEXT NOT NULL, doc TEXT NOT NULL, PRIMARY KEY (kind, id)
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS setting (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS user (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  person_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS session (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS login_link (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS invite (
  id TEXT PRIMARY KEY, hash TEXT NOT NULL UNIQUE, email TEXT NOT NULL, role TEXT NOT NULL,
  person_id TEXT, grant_branch INTEGER NOT NULL, created_by TEXT NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS branch_grant (
  user_id TEXT NOT NULL, anchor_person_id TEXT NOT NULL, granted_by TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, anchor_person_id)
);
CREATE TABLE IF NOT EXISTS join_request (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL, decided_by TEXT, created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS connection (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL, access TEXT NOT NULL, profile TEXT NOT NULL,
  created_at TEXT NOT NULL, last_used_at TEXT, revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS edit (
  id TEXT PRIMARY KEY, seq INTEGER, status TEXT NOT NULL,
  author_user_id TEXT, author_name TEXT NOT NULL, author_contact TEXT,
  origin TEXT NOT NULL, connection_id TEXT, message TEXT NOT NULL, note TEXT NOT NULL,
  ops TEXT NOT NULL, changes TEXT NOT NULL, warnings TEXT NOT NULL, touched TEXT NOT NULL,
  reviewed_by TEXT, review_note TEXT, reverts_edit_id TEXT,
  created_at TEXT NOT NULL, applied_at TEXT
);
CREATE INDEX IF NOT EXISTS edit_status ON edit (status, created_at);
CREATE TABLE IF NOT EXISTS edit_comment (
  id TEXT PRIMARY KEY, edit_id TEXT NOT NULL, author_name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, edit_id TEXT, body TEXT NOT NULL,
  created_at TEXT NOT NULL, read_at TEXT
);
`;

const TABLES = ['entity', 'meta', 'setting', 'user', 'session', 'login_link', 'invite', 'branch_grant', 'join_request', 'connection', 'edit', 'edit_comment', 'notification'];

export function openDatabase(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  return db;
}

/* Prepared statements are kept, so a query is compiled once. */
const prepared = new WeakMap();
function statement(db, sql) {
  let cache = prepared.get(db);
  if (!cache) prepared.set(db, (cache = new Map()));
  if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
  return cache.get(sql);
}

export const one = (db, sql, ...args) => statement(db, sql).get(...args) ?? null;
export const all = (db, sql, ...args) => statement(db, sql).all(...args);
export const run = (db, sql, ...args) => statement(db, sql).run(...args);

export function transaction(db, work) {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

/* Every row of every table, for the full backup. */
export function dump(db) {
  return Object.fromEntries(TABLES.map((table) => [table, all(db, `SELECT * FROM ${table}`)]));
}

/* Replace everything with a backup. Sessions are dropped, so everyone signs in again. */
export function restore(db, tables) {
  transaction(db, () => {
    for (const table of TABLES) {
      db.exec(`DELETE FROM ${table}`);
      if (table === 'session' || table === 'login_link') continue;
      for (const row of tables[table] ?? []) {
        const columns = Object.keys(row);
        run(db, `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`, ...columns.map((c) => row[c]));
      }
    }
  });
}

export const newId = (prefix) => `${prefix}_${randomBytes(9).toString('base64url')}`;
export const newToken = (prefix) => prefix + randomBytes(24).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const now = () => new Date().toISOString();
export const later = (days) => new Date(Date.now() + days * 86400000).toISOString();
