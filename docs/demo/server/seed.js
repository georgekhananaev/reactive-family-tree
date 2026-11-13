/*
 * The demo family: the fictional Marlows, 50 people over five generations,
 * with accounts for every role and a few things already in progress so each
 * part of the app has something to show.
 *
 * Everything is created through the same edit pipeline the app uses, so the
 * seeded history, suggestions and draft are real ones.
 */

import { run, now, newId } from './db.js';

const person = (id, given, sex, born, died = null, extra = {}) => ({ id, given, sex, born, died, ...extra });

const MARLOWS = person('elias', 'Elias', 'male', 1898, 1971, {
  family: 'Marlow', place: 'Bristol',
  partner: person('ada', 'Ada', 'female', 1902, 1989, { birthName: 'Finch', since: 1922, place: 'Bath' }),
  children: [
    person('rosalind', 'Rosalind', 'female', 1924, 2011, {
      family: 'Okafor', birthName: 'Marlow', place: 'Bristol',
      partner: person('henry', 'Henry', 'male', 1921, 1998, { since: 1946, place: 'Lagos' }),
      children: [
        person('thomas', 'Thomas', 'male', 1948, 2020, {
          partner: person('lucia', 'Lucia', 'female', 1950, null, { birthName: 'Ferri', since: 1973, place: 'Turin' }),
          children: [
            person('nora', 'Nora', 'female', 1975, null, {
              family: 'Bell', birthName: 'Okafor',
              partner: person('sam', 'Sam', 'male', 1973, null, { since: 2002 }),
              children: [person('iris', 'Iris', 'female', 2004), person('leo', 'Leo', 'male', 2008)],
            }),
            person('daniel', 'Daniel', 'male', 1978),
          ],
        }),
        person('margaret', 'Margaret', 'female', 1951, null, {
          family: 'Hale', birthName: 'Okafor',
          partner: person('paul', 'Paul', 'male', 1949, 2015, { since: 1977 }),
          children: [
            person('clara', 'Clara', 'female', 1980, null, {
              family: 'Brandt', birthName: 'Hale',
              partner: person('jonas', 'Jonas', 'male', 1979, null, { since: 2009, place: 'Hamburg' }),
              children: [person('adaj', 'Ada', 'female', 2012), person('felix', 'Felix', 'male', 2015), person('wren', 'Wren', 'female', 2024)],
            }),
          ],
        }),
        person('unknown1', '', 'unknown', 'about 1955'),
      ],
    }),
    person('walter', 'Walter', 'male', 1927, 1944, { place: 'Bristol' }),
    person('edith', 'Edith', 'female', 1930, 2019, {
      family: 'Lindqvist', birthName: 'Marlow', place: 'Bristol',
      partner: person('arthur', 'Arthur', 'male', 1928, 2003, { since: 1953, place: 'Uppsala' }),
      children: [
        person('peter', 'Peter', 'male', 1955, null, {
          partner: person('hana', 'Hana', 'female', 1958, null, { birthName: 'Sato', since: 1982, place: 'Osaka' }),
          children: [
            person('mika', 'Mika', 'female', 1984, null, {
              partner: person('jo', 'Jo', 'female', 1985, null, { birthName: 'Reyes', since: 2013 }),
              children: [person('sora', 'Sora', 'male', 2016)],
            }),
            person('elin', 'Elin', 'female', 1987),
          ],
        }),
        person('ruth', 'Ruth', 'female', 1958, 2001, {
          children: [
            person('simon', 'Simon', 'male', 1982, null, {
              partner: person('amira', 'Amira', 'female', 1984, null, { birthName: 'Haddad', since: 2009 }),
              children: [person('noor', 'Noor', 'female', 2011), person('eli', 'Eli', 'male', 2014)],
            }),
          ],
        }),
        person('karl', 'Karl', 'male', 1962, null, {
          partner: person('ines', 'Ines', 'female', 1965, null, { birthName: 'Moreno', since: 1990, place: 'Seville' }),
          children: [person('vera', 'Vera', 'female', 1992), person('oskar', 'Oskar', 'male', 1995)],
        }),
      ],
    }),
    person('george', 'George', 'male', 1934, 2022, {
      place: 'Bristol',
      partner: person('marta', 'Marta', 'female', 1938, null, { birthName: 'Novak', since: 1959, place: 'Brno' }),
      children: [
        person('frank', 'Frank', 'male', 1964, null, {
          partner: person('joan', 'Joan', 'female', 1966, null, { birthName: 'Ward', since: 1992 }),
          children: [person('alice', 'Alice', 'female', 1994), person('max', 'Max', 'male', 1997), person('tess', 'Tess', 'female', 2001)],
        }),
        person('helen', 'Helen', 'female', 1961, null, {
          family: 'Stein', birthName: 'Marlow',
          partner: person('david', 'David', 'male', 1960, null, { since: 1987 }),
          children: [
            person('ben', 'Ben', 'male', 1989, null, {
              partner: person('priya', 'Priya', 'female', 1990, null, { birthName: 'Rao', since: 2018 }),
              children: [person('kiran', 'Kiran', 'male', 2020)],
            }),
            person('sophie', 'Sophie', 'female', 1992),
          ],
        }),
      ],
    }),
  ],
});

/* The nested family as operations. Children take the family name of the branch they are born on. */
function familyOps(root) {
  const ops = [];
  const addPerson = (p, family) => {
    const ref = `$${p.id}`;
    ops.push({
      type: 'person.create', ref,
      set: { given: p.given, family: p.given ? family : '', birthName: p.birthName ?? '', sex: p.sex, living: p.died ? 'no' : p.given ? 'yes' : 'unknown' },
    });
    const born = typeof p.born === 'number' ? { kind: 'exact', from: String(p.born) } : { kind: 'about', from: p.born.replace('about ', '') };
    ops.push({ type: 'fact.add', subject: { type: 'person', id: ref }, set: { type: 'birth', date: born, place: p.place ?? '' } });
    if (p.died) ops.push({ type: 'fact.add', subject: { type: 'person', id: ref }, set: { type: 'death', date: { kind: 'exact', from: String(p.died) } } });
    return ref;
  };
  (function walk(node, inherited) {
    const family = node.family ?? inherited;
    const ref = addPerson(node, family);
    const children = node.children ?? [];
    if (node.partner || children.length) {
      const partners = node.partner ? [ref, addPerson(node.partner, family)] : [ref];
      const union = `$u_${node.id}`;
      ops.push({ type: 'union.create', ref: union, partners, set: { host: ref, since: node.partner?.since ?? null, kind: node.partner ? 'marriage' : 'unknown' } });
      for (const child of children) ops.push({ type: 'child.link', union, child: walk(child, family) });
    }
    return ref;
  })(root, root.family);
  return ops;
}

const ACCOUNTS = [
  { person: 'helen', role: 'owner', anchors: ['helen'], blurb: 'Owner. Keeps the tree and can do everything.' },
  { person: 'peter', role: 'admin', anchors: ['peter'], blurb: 'Admin. Edits anywhere and reviews suggestions.' },
  { person: 'margaret', role: 'member', anchors: ['margaret'], blurb: 'Steward of her branch: Clara and the grandchildren. Has an AI draft waiting.' },
  { person: 'karl', role: 'member', anchors: ['karl'], blurb: 'Steward of his branch. Has a suggestion to review.' },
  { person: 'nora', role: 'member', anchors: ['nora'], blurb: 'Steward of her branch: Iris and Leo.' },
  { person: 'sophie', role: 'member', anchors: ['sophie'], blurb: 'Member. Looks after her own leaf and suggests fixes elsewhere.' },
  { person: 'daniel', role: 'member', anchors: [], blurb: 'Member with no branch. Can edit only his own leaf.' },
];

const GUIDELINES = `Write names as the person themselves wrote them. Keep the birth family name in "born".
Record a date only as precisely as you know it: "about 1890" is better than a guessed day.
Add a place when you know it, as town and country.
Never guess. If nobody knows, leave it empty.`;

export function seed({ db, store, auth, edits }) {
  const family = auth.system('The Marlow family');
  const imported = edits.submit(family, { ops: familyOps(MARLOWS), message: 'Started the tree with the Marlow family', origin: 'import' });
  const id = (name) => imported.created[`$${name}`];
  const fact = (name, type) => [...store.state.facts.values()].find((f) => f.subject.id === id(name) && f.type === type).id;

  store.saveSettings({
    familyName: 'Marlow family',
    description: 'Descendants of Elias and Ada',
    rootPersonId: id('elias'),
    visibility: 'public_masked',
    visitorsCanSuggest: true,
    guidelines: GUIDELINES,
  });

  const users = {};
  for (const account of ACCOUNTS) {
    const p = store.state.people.get(id(account.person));
    const userId = newId('usr');
    run(db, 'INSERT INTO user (id, email, name, role, person_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      userId, `${account.person}@marlow.example`, `${p.given} ${p.family}`, account.role, p.id, now());
    for (const anchor of account.anchors) auth.addGrant(userId, id(anchor), 'The Marlow family');
    users[account.person] = auth.actorFor(auth.user(userId));
  }
  store.saveSettings({ demoAccounts: ACCOUNTS.map((a) => ({ email: `${a.person}@marlow.example`, blurb: a.blurb })) });

  // A little history, made by the people who would have made it
  edits.submit(users.helen, {
    message: 'Wrote down what Dad told me about Elias',
    ops: [{
      type: 'person.update', person: id('elias'),
      set: { bio: 'Elias grew up above his father’s cooperage on the Bristol docks and never lost the habit of tapping a barrel as he passed it. He met Ada at a dance in Bath in 1921 and they married the following spring.' },
    }, { type: 'fact.add', subject: { type: 'person', id: id('elias') }, set: { type: 'occupation', value: 'Cooper, then orchard keeper', date: { kind: 'after', from: '1919' } } }],
  });
  edits.submit(users.nora, {
    message: 'A memory of Dad',
    ops: [{ type: 'memory.add', person: id('thomas'), body: 'Dad taught me to graft apple trees the winter I turned nine. Two of those trees still fruit in the garden at home.' }],
  });

  // Waiting for review: a missing person, and a corrected date with a note
  edits.submit(users.sophie, {
    message: 'Add Lena, Karl and Ines’s youngest',
    note: 'She was at the reunion in 2019. I think she was born in 1998.',
    ops: [
      { type: 'person.create', ref: '$lena', set: { given: 'Lena', family: 'Lindqvist', sex: 'female', living: 'yes' } },
      { type: 'fact.add', subject: { type: 'person', id: '$lena' }, set: { type: 'birth', date: { kind: 'about', from: '1998' }, certainty: 'probable' } },
      { type: 'child.link', union: [...store.state.unions.values()].find((u) => u.host === id('karl')).id, child: '$lena' },
    ],
  });
  edits.submit(users.daniel, {
    message: 'Edith’s exact birthday',
    note: 'It is in Grandma Rosalind’s birthday book: 12 May.',
    ops: [{ type: 'fact.update', fact: fact('edith', 'birth'), set: { date: { kind: 'exact', from: '1930-05-12' } } }],
  });

  // Margaret has connected an AI client, and it has drafted changes for her to look over
  const connection = auth.createConnection(auth.user(users.margaret.userId), { name: 'Claude on my laptop', mode: 'review_first' });
  edits.submit(users.margaret, {
    message: 'From Margaret’s notes: the new baby and Paul’s birthday',
    origin: 'mcp', connectionId: connection.id, mode: 'draft',
    ops: [
      { type: 'person.create', ref: '$juno', set: { given: 'Juno', family: 'Brandt', sex: 'female', living: 'yes' } },
      { type: 'fact.add', subject: { type: 'person', id: '$juno' }, set: { type: 'birth', date: { kind: 'exact', from: '2026-09-02' }, place: 'Hamburg' } },
      { type: 'child.link', union: [...store.state.unions.values()].find((u) => u.host === id('clara')).id, child: '$juno' },
      { type: 'fact.update', fact: fact('paul', 'birth'), set: { date: { kind: 'exact', from: '1949-06-03' } } },
    ],
  });
}
