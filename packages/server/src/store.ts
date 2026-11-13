/*
 * The family in memory, backed by the database.
 *
 * A family is small enough to hold in memory, so every question is answered
 * from here. Every change is worked out on a copy by the shared operations,
 * written to the tables in one transaction, and only then becomes the family
 * this process answers from.
 *
 * Other processes may write too (several containers, or a serverless host), so
 * before answering, `fresh()` checks two counters and reads the family again
 * if either has moved.
 */

import { emptyState, sortKey } from '@reactive-family-tree/core';
import type { Change, Fact, Memory, Person, State, Union } from '@reactive-family-tree/core';
import { fact, memory, meta, person, setting, union, unionChild, unionPartner, user } from '@reactive-family-tree/db';
import type { Database, Queryable } from '@reactive-family-tree/db';
import { asc, eq, sql } from 'drizzle-orm';

import { DEFAULT_SETTINGS } from './settings';
import type { Settings } from './settings';

const SEQ = 'seq';
const SETTINGS_REV = 'settings_rev';

export class FamilyStore {
  state: State = emptyState();
  settings: Settings = { ...DEFAULT_SETTINGS };
  /* The number of the last applied edit. */
  seq = 0;
  private settingsRev = 0;
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly db: Database) {}

  /* Make sure memory matches the database. One small query when nothing has changed. */
  async fresh(): Promise<void> {
    const counters = await this.counters();
    if (!this.loaded || counters.seq !== this.seq || counters.settingsRev !== this.settingsRev) await this.load(counters);
  }

  private async counters(): Promise<{ seq: number; settingsRev: number }> {
    const rows = await this.db.select().from(meta);
    const read = (key: string) => Number(rows.find((row) => row.key === key)?.value ?? 0);
    return { seq: read(SEQ), settingsRev: read(SETTINGS_REV) };
  }

  async load(counters?: { seq: number; settingsRev: number }): Promise<void> {
    const { db } = this;
    const [at, people, unions, partners, children, facts, memories, settings] = await Promise.all([
      counters ?? this.counters(),
      db.select().from(person),
      db.select().from(union),
      db.select().from(unionPartner).orderBy(asc(unionPartner.position)),
      db.select().from(unionChild).orderBy(asc(unionChild.position)),
      db.select().from(fact),
      db.select().from(memory),
      db.select().from(setting),
    ]);

    const state = emptyState();
    for (const row of people) state.people.set(row.id, row);
    for (const { hostPersonId, ...row } of unions) state.unions.set(row.id, { ...row, host: hostPersonId, partners: [], children: [] });
    for (const row of partners) state.unions.get(row.unionId)?.partners.push(row.personId);
    for (const row of children) state.unions.get(row.unionId)?.children.push({ id: row.childId, kind: row.kind });
    for (const { subjectType, subjectId, dateSort: _dateSort, ...row } of facts) state.facts.set(row.id, { ...row, subject: { type: subjectType, id: subjectId } });
    for (const row of memories) state.memories.set(row.id, row);

    this.state = state;
    this.settings = { ...DEFAULT_SETTINGS, ...Object.fromEntries(settings.map((row) => [row.key, row.value])) };
    this.seq = at.seq;
    this.settingsRev = at.settingsRev;
    this.loaded = true;
  }

  /* Nobody has claimed this install yet: no people, and no accounts. */
  async isEmpty(): Promise<boolean> {
    if (this.state.people.size) return false;
    const [anyone] = await this.db.select({ id: user.id }).from(user).limit(1);
    return !anyone;
  }

  /*
   * One writer at a time in this process. Everything that changes the family
   * runs through here, so two edits can never be worked out on the same copy.
   */
  exclusive<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => {});
    return run;
  }

  /* Write what an edit changed. Called inside the edit's transaction. */
  async persist(tx: Queryable, changes: Pick<Change, 'kind' | 'id' | 'after'>[]): Promise<void> {
    for (const change of changes) {
      if (change.kind === 'people') {
        const row = change.after as Person;
        await tx.insert(person).values(row).onConflictDoUpdate({ target: person.id, set: row });
      } else if (change.kind === 'unions') {
        const { host, partners, children, ...rest } = change.after as Union;
        const row = { ...rest, hostPersonId: host };
        await tx.insert(union).values(row).onConflictDoUpdate({ target: union.id, set: row });
        await tx.delete(unionPartner).where(eq(unionPartner.unionId, row.id));
        await tx.delete(unionChild).where(eq(unionChild.unionId, row.id));
        if (partners.length) await tx.insert(unionPartner).values(partners.map((personId, position) => ({ unionId: row.id, personId, position })));
        if (children.length) await tx.insert(unionChild).values(children.map((child, position) => ({ unionId: row.id, childId: child.id, kind: child.kind, position })));
      } else if (change.kind === 'facts') {
        const { subject, ...rest } = change.after as Fact;
        const row = { ...rest, subjectType: subject.type, subjectId: subject.id, dateSort: sortKey(rest.date) };
        await tx.insert(fact).values(row).onConflictDoUpdate({ target: fact.id, set: row });
      } else {
        const row = change.after as Memory;
        await tx.insert(memory).values(row).onConflictDoUpdate({ target: memory.id, set: row });
      }
    }
  }

  /* Remove something for good. Only the compost purge does this. */
  async erase(tx: Queryable, kind: Change['kind'], id: string): Promise<void> {
    if (kind === 'people') await tx.delete(person).where(eq(person.id, id));
    else if (kind === 'facts') await tx.delete(fact).where(eq(fact.id, id));
    else if (kind === 'memories') await tx.delete(memory).where(eq(memory.id, id));
    else {
      await tx.delete(unionPartner).where(eq(unionPartner.unionId, id));
      await tx.delete(unionChild).where(eq(unionChild.unionId, id));
      await tx.delete(union).where(eq(union.id, id));
    }
  }

  /* Every applied edit gets the next number. It is the order of history and what browsers sync on. */
  async writeSeq(tx: Queryable, seq: number): Promise<void> {
    await this.bump(tx, SEQ, seq);
  }

  /* After a transaction went through: this is the family now. */
  adopt(state: State, seq: number): void {
    this.state = state;
    this.seq = seq;
  }

  async saveSettings(patch: Partial<Settings>): Promise<void> {
    const next = this.settingsRev + 1;
    await this.db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(patch)) {
        // A setting that is emptied is not kept at all. Only one whose default is empty can be: the family's place, and whose tree it is.
        if (value === null) await tx.delete(setting).where(eq(setting.key, key));
        else await tx.insert(setting).values({ key, value }).onConflictDoUpdate({ target: setting.key, set: { value } });
      }
      await this.bump(tx, SETTINGS_REV, next);
    });
    this.settings = { ...this.settings, ...patch };
    this.settingsRev = next;
  }

  private async bump(tx: Queryable, key: string, value: number): Promise<void> {
    await tx
      .insert(meta)
      .values({ key, value: String(value) })
      .onConflictDoUpdate({ target: meta.key, set: { value: sql`excluded.value` } });
  }
}
