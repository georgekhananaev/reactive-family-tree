/*
 * The demo family: the fictional Marlows, 50 people over five generations,
 * with accounts for every role and a few things already in progress so each
 * part of the app has something to show.
 *
 * Everything is created through the same edit pipeline the app uses, so the
 * seeded history, suggestions and draft are real ones.
 */

import type { Actor } from '@reactive-family-tree/core';
import { DEMO_ACCOUNTS, DEMO_FAMILY, DEMO_GUIDELINES, familyOps } from '@reactive-family-tree/demo-data';

import type { App } from './app';
import { restore } from './backup';

/* The Marlows alone, with no accounts. Returns their ids by the names used in the demo data. */
async function plantDemoFamily({ store, members, edits }: App): Promise<(name: string) => string> {
  const family = members.system('The Marlow family');
  const imported = await edits.submit(family, { ops: familyOps(), message: 'Started the tree with the Marlow family', origin: 'import' });
  await store.saveSettings({ rootPersonId: imported.created[DEMO_FAMILY.rootRef] ?? null });
  return (name) => imported.created[`$${name}`] as string;
}

/* The whole demo: the family, an account for every role, and work in progress. */
export async function seedDemo(app: App): Promise<void> {
  const { store, members, edits } = app;
  const id = await plantDemoFamily(app);
  const fact = (name: string, type: string) => [...store.state.facts.values()].find((f) => f.subject.id === id(name) && f.type === type)?.id as string;
  const unionOf = (name: string) => [...store.state.unions.values()].find((u) => u.host === id(name))?.id as string;

  await store.saveSettings({
    familyName: DEMO_FAMILY.familyName,
    description: DEMO_FAMILY.description,
    visibility: 'public_masked',
    visitorsCanSuggest: true,
    guidelines: DEMO_GUIDELINES,
  });

  const users: Record<string, Actor> = {};
  for (const account of DEMO_ACCOUNTS) {
    const leaf = store.state.people.get(id(account.person));
    if (!leaf) continue;
    const created = await members.createUser({ name: `${leaf.given} ${leaf.family}`, email: account.email, role: account.role, personId: leaf.id });
    for (const anchor of account.anchors) await members.addGrant(created.id, id(anchor), 'The Marlow family');
    users[account.person] = await members.actorFor(created);
  }
  await store.saveSettings({ demoAccounts: DEMO_ACCOUNTS.map((account) => ({ email: account.email, blurb: account.blurb })) });
  const as = (name: string) => users[name] as Actor;

  // A little history, made by the people who would have made it
  await edits.submit(as('helen'), {
    message: 'Wrote down what Dad told me about Elias',
    ops: [{
      type: 'person.update', person: id('elias'),
      set: { bio: 'Elias grew up above his father’s cooperage on the Bristol docks and never lost the habit of tapping a barrel as he passed it. He met Ada at a dance in Bath in 1921 and they married the following spring.' },
    }, { type: 'fact.add', subject: { type: 'person', id: id('elias') }, set: { type: 'occupation', value: 'Cooper, then orchard keeper', date: { kind: 'after', from: '1919' } } }],
  });
  await edits.submit(as('nora'), {
    message: 'A memory of Dad',
    ops: [{ type: 'memory.add', person: id('thomas'), body: 'Dad taught me to graft apple trees the winter I turned nine. Two of those trees still fruit in the garden at home.' }],
  });

  // Waiting for review: a missing person, and a corrected date with a note
  await edits.submit(as('sophie'), {
    message: 'Add Lena, Karl and Ines’s youngest',
    note: 'She was at the reunion in 2019. I think she was born in 1998.',
    ops: [
      { type: 'person.create', ref: '$lena', set: { given: 'Lena', family: 'Lindqvist', sex: 'female', living: 'yes' } },
      { type: 'fact.add', subject: { type: 'person', id: '$lena' }, set: { type: 'birth', date: { kind: 'about', from: '1998' }, certainty: 'probable' } },
      { type: 'child.link', union: unionOf('karl'), child: '$lena' },
    ],
  });
  await edits.submit(as('daniel'), {
    message: 'Edith’s exact birthday',
    note: 'It is in Grandma Rosalind’s birthday book: 12 May.',
    ops: [{ type: 'fact.update', fact: fact('edith', 'birth'), set: { date: { kind: 'exact', from: '1930-05-12' } } }],
  });

  // Margaret has connected an AI client, and it has drafted changes for her to look over
  const margaret = await members.user(as('margaret').userId as string);
  if (!margaret) return;
  const connection = await members.createConnection(margaret, { name: 'Claude on my laptop', mode: 'review_first' });
  await edits.submit(as('margaret'), {
    message: 'From Margaret’s notes: the new baby and Paul’s birthday',
    origin: 'mcp', connectionId: connection.id, mode: 'draft',
    ops: [
      { type: 'person.create', ref: '$juno', set: { given: 'Juno', family: 'Brandt', sex: 'female', living: 'yes' } },
      { type: 'fact.add', subject: { type: 'person', id: '$juno' }, set: { type: 'birth', date: { kind: 'exact', from: '2026-09-02' }, place: 'Hamburg' } },
      { type: 'child.link', union: unionOf('clara'), child: '$juno' },
      { type: 'fact.update', fact: fact('paul', 'birth'), set: { date: { kind: 'exact', from: '1949-06-03' } } },
    ],
  });
}

/* Wipe everything and plant the demo again. Only a demo install offers this. */
export async function resetDemo(app: App): Promise<void> {
  await app.store.exclusive(async () => {
    await restore(app.db, { format: 'reactive-family-tree-backup', version: 2, tables: {} });
    await app.store.load();
  });
  await seedDemo(app);
  app.hub.changed(app.store.seq);
}
