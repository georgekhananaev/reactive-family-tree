/*
 * The family in memory, backed by the database.
 *
 * The whole family is small enough to hold in memory, so every question is
 * answered from here and every change is made here first by the shared
 * operations, then written through to disk.
 */

import { emptyState } from '../core/graph.js';
import { all, one, run } from './db.js';

/* What the admin can set from the UI, with the safe choices as defaults. */
export const DEFAULT_SETTINGS = {
  familyName: 'Our family',
  description: '',
  rootPersonId: null,
  visibility: 'private',           // 'private' | 'public_masked' | 'public'
  visitorsCanSuggest: false,
  allowJoinRequests: true,
  stewardsCanInvite: true,
  stewardsReview: true,
  livingAge: 110,
  guidelines: '',
  allowAi: true,
  allowAiDirect: true,
  aiWritesPerHour: 120,
};

export class Store {
  constructor(db) {
    this.db = db;
    this.load();
  }

  load() {
    this.state = emptyState();
    for (const row of all(this.db, 'SELECT kind, id, doc FROM entity')) {
      this.state[row.kind].set(row.id, JSON.parse(row.doc));
    }
    this.settings = { ...DEFAULT_SETTINGS };
    for (const row of all(this.db, 'SELECT key, value FROM setting')) this.settings[row.key] = JSON.parse(row.value);
    this.seq = Number(one(this.db, "SELECT value FROM meta WHERE key = 'seq'")?.value ?? 0);
  }

  get isEmpty() {
    return this.state.people.size === 0 && !one(this.db, 'SELECT id FROM user LIMIT 1');
  }

  /* Write what an edit changed. Called inside the edit's transaction. */
  persist(changes) {
    for (const change of changes) {
      run(this.db, 'INSERT INTO entity (kind, id, doc) VALUES (?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET doc = excluded.doc',
        change.kind, change.id, JSON.stringify(change.after));
    }
  }

  /* Remove something for good. Only the compost purge does this. */
  erase(kind, id) {
    this.state[kind].delete(id);
    run(this.db, 'DELETE FROM entity WHERE kind = ? AND id = ?', kind, id);
  }

  /* Every applied edit gets the next number. It is the order of history and what browsers sync on. */
  nextSeq() {
    this.seq += 1;
    run(this.db, "INSERT INTO meta (key, value) VALUES ('seq', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value", String(this.seq));
    return this.seq;
  }

  saveSettings(patch) {
    for (const [key, value] of Object.entries(patch)) {
      this.settings[key] = value;
      run(this.db, 'INSERT INTO setting (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value', key, JSON.stringify(value));
    }
  }
}
