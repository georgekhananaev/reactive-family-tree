import assert from 'node:assert/strict';
import { test } from 'vitest';

import { applyOps, bornYear, cloneState, diedYear, emptyState, fullName, indexOf, parseDate, validate } from '@reactive-family-tree/core';
import type { Op, OpEnv, PersonFields, State } from '@reactive-family-tree/core';

import { exportGedcom, importGedcom } from '../src/index';

/* One counter for the whole file, so an id is never given twice. */
let n = 0;
const env: OpEnv = { newId: (prefix) => `${prefix}${++n}`, now: '2026-01-01T00:00:00.000Z', userId: null, userName: 'Tester' };

const somebody = (ref: string, set: Partial<PersonFields>): Op => ({ type: 'person.create', ref, set });
const born = (person: string, when: string, place = ''): Op => ({ type: 'fact.add', subject: { type: 'person', id: person }, set: { type: 'birth', date: parseDate(when), place } });
const died = (person: string, when: string): Op => ({ type: 'fact.add', subject: { type: 'person', id: person }, set: { type: 'death', date: parseDate(when) } });

/* Three generations: Elias and Ada, their children Rosalind and Walter, and Rosalind's family with Henry. One child of theirs is known only by a rough year. */
function smallFamily(): State {
  const state = emptyState();
  applyOps(state, [
    somebody('$elias', { given: 'Elias', family: 'Marlow', sex: 'male', living: 'no' }), born('$elias', '1898', 'Bristol'), died('$elias', '1971'),
    somebody('$ada', { given: 'Ada', family: 'Marlow', birthName: 'Finch', sex: 'female', living: 'no' }), born('$ada', '1902', 'Bath'), died('$ada', '1989'),
    somebody('$rosalind', { given: 'Rosalind', family: 'Okafor', birthName: 'Marlow', sex: 'female', living: 'no' }), born('$rosalind', '4 March 1924'), died('$rosalind', '2011'),
    somebody('$walter', { given: 'Walter', family: 'Marlow', sex: 'male', living: 'no' }), born('$walter', '1927'), died('$walter', '1944'),
    somebody('$henry', { given: 'Henry', family: 'Okafor', sex: 'male', living: 'no' }), born('$henry', '1921', 'Lagos'), died('$henry', '1998'),
    somebody('$thomas', { given: 'Thomas', family: 'Okafor', sex: 'male', living: 'yes' }), born('$thomas', '1948'),
    somebody('$unnamed', {}), born('$unnamed', 'about 1955'),
    { type: 'union.create', ref: '$u_elias', partners: ['$elias', '$ada'], set: { since: 1922 } },
    { type: 'child.link', union: '$u_elias', child: '$rosalind' },
    { type: 'child.link', union: '$u_elias', child: '$walter' },
    { type: 'union.create', ref: '$u_rosalind', partners: ['$rosalind', '$henry'], set: { host: '$rosalind', since: 1946 } },
    { type: 'child.link', union: '$u_rosalind', child: '$thomas' },
    { type: 'child.link', union: '$u_rosalind', child: '$unnamed' },
  ], env);
  return state;
}

/* The family as it reads, without its ids: who there is, who is with whom, and whose children are whose. */
function picture(state: State) {
  const ix = indexOf(state);
  const lifeOf = (id: string) => `${fullName(state.people.get(id))}, ${bornYear(ix, id) ?? '?'} to ${diedYear(ix, id) ?? '?'}`;
  return {
    people: [...state.people.values()].map((p) => ({ life: lifeOf(p.id), birthName: p.birthName, sex: p.sex })).sort((a, b) => a.life.localeCompare(b.life)),
    couples: [...state.unions.values()]
      .map((union) => ({ partners: union.partners.map(lifeOf).sort(), since: union.since, children: union.children.map((child) => lifeOf(child.id)).sort() }))
      .sort((a, b) => a.partners[0].localeCompare(b.partners[0])),
  };
}

test('the family can leave with all its data, and come back', () => {
  const state = smallFamily();
  const gedcom = exportGedcom(state, 'Marlow family');
  assert.match(gedcom, /1 NAME Ada \/Finch\//);
  assert.match(gedcom, /2 DATE ABT 1955/);
  const people = state.people.size;
  assert.equal(gedcom.match(/ INDI$/gm)?.length, people);

  // importing only returns operations: nothing is written until they are applied
  const staged = importGedcom(gedcom);
  assert.equal(staged.people, people);
  assert.equal(staged.families, state.unions.size);
  assert.deepEqual(staged.skipped, []);

  const back = emptyState();
  applyOps(back, staged.ops, env);
  const seen = picture(back);
  assert.deepEqual(seen, picture(state));

  // names, and the years of birth and death
  assert.deepEqual(seen.people.map((p) => p.life), [
    'Ada Marlow, 1902 to 1989', 'Elias Marlow, 1898 to 1971', 'Henry Okafor, 1921 to 1998', 'Rosalind Okafor, 1924 to 2011',
    'Thomas Okafor, 1948 to ?', 'Unknown, 1955 to ?', 'Walter Marlow, 1927 to 1944',
  ]);
  assert.equal(seen.people[0].birthName, 'Finch');
  // partnerships, and who is whose child
  assert.deepEqual(seen.couples, [
    { partners: ['Ada Marlow, 1902 to 1989', 'Elias Marlow, 1898 to 1971'], since: 1922, children: ['Rosalind Okafor, 1924 to 2011', 'Walter Marlow, 1927 to 1944'] },
    { partners: ['Henry Okafor, 1921 to 1998', 'Rosalind Okafor, 1924 to 2011'], since: 1946, children: ['Thomas Okafor, 1948 to ?', 'Unknown, 1955 to ?'] },
  ]);
  // a date comes back as precisely as it left
  const rosalind = [...back.people.values()].find((p) => p.given === 'Rosalind');
  assert.deepEqual(indexOf(back).factsOfSubject.get(rosalind?.id ?? '')?.[0].date, { kind: 'exact', from: '1924-03-04' });

  const again = cloneState(state);
  const { warnings } = validate(again, applyOps(again, staged.ops, env).changes);
  assert.ok(warnings.some((w) => w.code === 'possible_duplicate'), 'importing the same family again is noticed');
});

test('a file from other software is read as far as it is understood', () => {
  const text = [
    '\uFEFF0 HEAD', '1 SOUR Elsewhere',
    '0 @I1@ INDI', '1 NAME Jane /Doe/', '1 NAME Jane /Smith/', '2 TYPE married', '1 SEX F', '1 OCCU Weaver', '2 DATE BET 1920 AND 1930',
    '1 NOTE First line', '2 CONT second line', '1 DEAT Y', '1 _UID 123', '1 FAMS @F1@',
    '0 @I2@ INDI', '1 NAME Kit /Smith/', '1 SEX U', '1 FAMC @F1@', '2 PEDI adopted',
    '0 @F1@ FAM', '1 WIFE @I1@', '1 CHIL @I2@',
    '0 @F2@ FAM', '1 CHIL @I2@',
    '0 TRLR',
  ].join('\r\n');
  const found = importGedcom(text);
  assert.equal(found.people, 2);
  assert.equal(found.families, 1);
  assert.deepEqual(found.skipped, ['_UID', 'FAM without parents']);
  assert.deepEqual(found.ops, [
    { type: 'person.create', ref: '$i_I1', set: { given: 'Jane', family: 'Smith', birthName: 'Doe', sex: 'female', living: 'no', bio: 'First line\nsecond line' } },
    { type: 'fact.add', subject: { type: 'person', id: '$i_I1' }, set: { type: 'occupation', date: { kind: 'between', from: '1920', to: '1930' }, place: '', value: 'Weaver', note: '' } },
    { type: 'person.create', ref: '$i_I2', set: { given: 'Kit', family: 'Smith', birthName: '', sex: 'unknown', living: 'unknown', bio: '' } },
    { type: 'union.create', ref: '$f_F1', partners: ['$i_I1'], set: { kind: 'unknown', status: 'current', since: null } },
    { type: 'child.link', union: '$f_F1', child: '$i_I2', kind: 'adopted' },
  ]);
  assert.throws(() => importGedcom('This is not a family tree.'), /No people were found in that file/);
});
