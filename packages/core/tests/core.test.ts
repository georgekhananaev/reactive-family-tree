import assert from 'node:assert/strict';
import { test } from 'vitest';

import { formatDate, fromGedcom, parseDate, sortKey, toGedcom, yearOf } from '../src/dates';
import { emptyState, indexOf, scopeOf } from '../src/graph';
import { describeKinship, stepWord } from '../src/kinship';
import { OpError, applyOps } from '../src/ops';
import { decideEdit } from '../src/permissions';
import { validate } from '../src/validate';
import type { Actor, FuzzyDate, KinStep, Op, OpEnv, RuleSettings, Sex } from '../src/types';

test('dates are kept as precisely as they were given', () => {
  const cases: [typed: string, stored: FuzzyDate, spoken: string][] = [
    ['1921', { kind: 'exact', from: '1921' }, '1921'],
    ['March 1921', { kind: 'exact', from: '1921-03' }, 'March 1921'],
    ['4 March 1921', { kind: 'exact', from: '1921-03-04' }, '4 March 1921'],
    ['1921-03-04', { kind: 'exact', from: '1921-03-04' }, '4 March 1921'],
    ['about 1890', { kind: 'about', from: '1890' }, 'about 1890'],
    ['abt. 1890', { kind: 'about', from: '1890' }, 'about 1890'],
    ['before August 1914', { kind: 'before', from: '1914-08' }, 'before August 1914'],
    ['after 1945', { kind: 'after', from: '1945' }, 'after 1945'],
    ['between 1921 and 1922', { kind: 'between', from: '1921', to: '1922' }, 'between 1921 and 1922'],
    ['1921 or 1922', { kind: 'or', from: '1921', to: '1922' }, '1921 or 1922'],
    ['before the war', { kind: 'text', text: 'before the war' }, 'before the war'],
  ];
  for (const [typed, stored, spoken] of cases) {
    assert.deepEqual(parseDate(typed), stored, typed);
    assert.equal(formatDate(stored), spoken, typed);
  }
  assert.equal(parseDate('  '), null);
  assert.equal(yearOf(parseDate('about 1890')), 1890);
  const march = sortKey(parseDate('March 1921'));
  const april = sortKey(parseDate('4 April 1921'));
  assert.ok(march !== null && april !== null && march < april);
});

test('dates survive a trip through GEDCOM', () => {
  for (const typed of ['1921', '4 March 1921', 'about 1890', 'before 1914', 'after 1945', 'between 1921 and 1922']) {
    assert.deepEqual(fromGedcom(toGedcom(parseDate(typed))), parseDate(typed), typed);
  }
  assert.equal(toGedcom(parseDate('4 March 1921')), '4 MAR 1921');
});

/* A small family: grandparents, their child Anna with partner Ben from elsewhere, grandchild Cleo. And Zed, unrelated. */
function smallFamily() {
  const state = emptyState();
  let n = 0;
  const env: OpEnv = { newId: (prefix) => `${prefix}${++n}`, now: '2026-01-01T00:00:00.000Z', userId: 'u', userName: 'Tester' };
  const { created } = applyOps(state, [
    { type: 'person.create', ref: '$gran', set: { given: 'Gran' } },
    { type: 'person.create', ref: '$anna', set: { given: 'Anna' } },
    { type: 'person.create', ref: '$ben', set: { given: 'Ben' } },
    { type: 'person.create', ref: '$cleo', set: { given: 'Cleo', living: 'yes' } },
    { type: 'person.create', ref: '$zed', set: { given: 'Zed' } },
    { type: 'union.create', ref: '$g', partners: ['$gran'] },
    { type: 'child.link', union: '$g', child: '$anna' },
    { type: 'union.create', ref: '$ab', partners: ['$anna', '$ben'] },
    { type: 'child.link', union: '$ab', child: '$cleo' },
    { type: 'fact.add', ref: '$cleoBirth', subject: { type: 'person', id: '$cleo' }, set: { type: 'birth', date: { kind: 'exact', from: '2015' } } },
  ], env);
  return { state, env, id: Object.fromEntries(Object.entries(created).map(([ref, value]) => [ref.slice(1), value])) };
}

const SETTINGS: RuleSettings = { visibility: 'public_masked', visitorsCanSuggest: true, livingAge: 110 };

test('a branch is the anchor, their descendants, and those descendants’ partners', () => {
  const { state, id } = smallFamily();
  const scope = scopeOf(state, indexOf(state), [id.anna]);
  assert.deepEqual([...scope.core].sort(), [id.anna, id.cleo].sort());
  assert.deepEqual([...scope.partners], [id.ben]);
});

test('who may change what', () => {
  const { state, id } = smallFamily();
  const steward: Actor = { userId: 'u1', name: 'Steward', role: 'member', personId: id.anna, anchors: [id.anna], visitor: false };
  const member: Actor = { userId: 'u2', name: 'Member', role: 'member', personId: id.zed, anchors: [], visitor: false };
  const admin: Actor = { userId: 'u3', name: 'Admin', role: 'admin', personId: null, anchors: [], visitor: false };
  const visitor: Actor = { userId: null, name: 'Visitor', role: null, personId: null, anchors: [], visitor: true };
  const outcome = (actor: Actor, ops: Op[], settings = SETTINGS) => decideEdit(state, actor, ops, settings, 2026).outcome;
  const rename = (person: string): Op[] => [{ type: 'person.update', person, set: { given: 'New' } }];
  const newChild = (union: string): Op[] => [{ type: 'person.create', ref: '$kid', set: { given: 'Kid' } }, { type: 'child.link', union, child: '$kid' }];

  // inside the branch: publishes
  assert.equal(outcome(steward, rename(id.cleo)), 'apply');
  assert.equal(outcome(steward, rename(id.ben)), 'apply', 'a partner who married in can be edited');
  assert.equal(outcome(steward, newChild(id.ab)), 'apply');
  assert.equal(outcome(steward, [{ type: 'fact.update', fact: id.cleoBirth, set: { place: 'Leeds' } }]), 'apply');
  // new partner for a descendant, and a fact on that new person, in one edit
  assert.equal(outcome(steward, [
    { type: 'person.create', ref: '$p', set: { given: 'Partner' } },
    { type: 'fact.add', subject: { type: 'person', id: '$p' }, set: { type: 'birth' } },
    { type: 'union.create', partners: [id.cleo, '$p'] },
  ]), 'apply');

  // outside the branch: a suggestion
  assert.equal(outcome(steward, rename(id.gran)), 'suggest', 'the anchor’s own parents are outside');
  assert.equal(outcome(steward, rename(id.zed)), 'suggest');
  assert.equal(outcome(steward, newChild(id.g)), 'suggest', 'a sibling of the anchor is outside');
  assert.equal(outcome(steward, [{ type: 'child.link', union: id.ab, child: id.zed }]), 'suggest', 'pulling in someone from another branch needs review');
  assert.equal(outcome(steward, [{ type: 'union.create', partners: [id.ben, id.zed] }]), 'suggest', 'a partner’s other marriages belong to their own family');
  assert.equal(outcome(steward, [{ type: 'person.create', ref: '$x', set: { given: 'Loose' } }]), 'suggest', 'an unconnected person needs an admin');
  assert.equal(outcome(steward, [{ type: 'person.remove', person: id.anna }]), 'suggest', 'removing your own leaf needs an admin');
  assert.equal(outcome(steward, [{ type: 'person.remove', person: id.cleo }]), 'apply');

  // a member with no branch: own leaf only
  assert.equal(outcome(member, rename(id.zed)), 'apply');
  assert.equal(outcome(member, rename(id.cleo)), 'suggest');
  assert.equal(outcome(member, [{ type: 'memory.add', person: id.cleo, body: 'hello' }]), 'apply');

  // admins everywhere, visitors only by suggestion
  assert.equal(outcome(admin, rename(id.gran)), 'apply');
  assert.equal(outcome(visitor, rename(id.gran)), 'suggest');
  assert.equal(outcome(visitor, rename(id.gran), { ...SETTINGS, visitorsCanSuggest: false }), 'deny');
  assert.equal(outcome(visitor, [{ type: 'memory.add', person: id.cleo, body: 'hi' }]), 'deny');

  // nobody makes a living person public but that person
  const goPublic: Op[] = [{ type: 'person.update', person: id.cleo, set: { privacy: 'public' } }];
  assert.equal(outcome(admin, goPublic), 'deny');
  assert.equal(outcome({ ...member, personId: id.cleo }, goPublic), 'apply');
  // undo's own operation cannot be sent by anyone
  assert.equal(outcome(admin, [{ type: 'entity.set', kind: 'people', id: id.zed, snapshot: null }]), 'deny');
});

test('an edit that would break the family is refused, one that only looks odd is flagged', () => {
  const { state, env, id } = smallFamily();
  const attempt = (ops: Op[]) => validate(state, applyOps(state, ops, env).changes);

  const loop = attempt([{ type: 'union.create', ref: '$c', partners: [id.cleo] }, { type: 'child.link', union: '$c', child: id.gran }]);
  assert.equal(loop.errors[0].code, 'own_ancestor');

  const dead = attempt([{ type: 'fact.add', subject: { type: 'person', id: id.cleo }, set: { type: 'death', date: { kind: 'exact', from: '2001' } } }]);
  assert.ok(dead.errors.some((e) => e.code === 'died_before_born'));

  const young = attempt([{ type: 'fact.add', subject: { type: 'person', id: id.ben }, set: { type: 'birth', date: { kind: 'exact', from: '2010' } } }]);
  assert.ok(young.warnings.some((w) => w.code === 'unlikely_parent_age'));
});

test('operations refuse nonsense and name what was wrong', () => {
  const { state, env, id } = smallFamily();
  // Nonsense does not fit the types, which is the point: it arrives as data
  const codeOf = (ops: unknown[]) => { try { applyOps(state, ops as Op[], env); return null; } catch (error) { return error instanceof OpError ? error.code : error; } };
  assert.equal(codeOf([{ type: 'person.update', person: id.anna, set: { sex: 'robot' } }]), 'bad_value');
  assert.equal(codeOf([{ type: 'person.update', person: id.anna, set: { shoeSize: 9 } }]), 'unknown_field');
  assert.equal(codeOf([{ type: 'person.update', person: 'nobody', set: {} }]), 'not_found');
  assert.equal(codeOf([{ type: 'child.link', union: id.ab, child: id.anna }]), 'own_parent');
  assert.equal(codeOf([{ type: 'union.add_partner', union: id.ab, person: id.zed }]), 'too_many_partners');
  assert.equal(codeOf([{ type: 'child.link', union: '$nothing', child: id.zed }]), 'unknown_reference');
  assert.equal(codeOf([{ type: 'launch.rocket' }]), 'unknown_operation');
});

test('relationships are named the way a family would say them', () => {
  const chain = (hows: string, sex: Sex = 'unknown', sexBefore: Sex = 'unknown'): KinStep[] => (hows.split(' ').filter(Boolean) as KinStep['how'][])
    .map((how, i, all) => ({ how, sex: i === all.length - 1 ? sex : i === all.length - 2 ? sexBefore : 'unknown' }));
  const cases: [hows: string, sex: Sex, expected: string][] = [
    ['parent', 'female', 'your mother'],
    ['parent parent', 'male', 'your grandfather'],
    ['parent parent parent', 'unknown', 'your great-grandparent'],
    ['child', 'male', 'your son'],
    ['child child child', 'female', 'your great-granddaughter'],
    ['parent child', 'female', 'your sister'],
    ['parent parent child', 'female', 'your aunt'],
    ['parent parent parent child', 'male', 'your great-uncle'],
    ['parent child child', 'unknown', 'your niece or nephew'],
    ['parent parent child child', 'unknown', 'your first cousin'],
    ['parent parent child child child', 'unknown', 'your first cousin once removed'],
    ['parent parent parent child child child', 'unknown', 'your second cousin'],
    ['partner', 'female', 'your partner'],
    ['partner parent', 'female', 'your partner\u2019s mother'],
  ];
  for (const [hows, sex, expected] of cases) assert.equal(describeKinship(chain(hows, sex)), expected, hows);
  assert.equal(describeKinship(chain('parent parent child partner', 'male', 'female')), 'the partner of your aunt');
  assert.equal(describeKinship(chain('child parent')), null, 'a child\u2019s other parent has no simple name');
  assert.equal(describeKinship([]), 'you');
  assert.deepEqual(chain('parent child partner', 'unknown', 'male').map(stepWord), ['parent', 'son', 'partner']);
});

test('operations and fields are only what the rules name, whatever every object happens to carry', () => {
  const { state, env, id } = smallFamily();
  const codeOf = (ops: unknown): string | null => { try { applyOps(state, ops as Op[], env); return null; } catch (error) { return error instanceof OpError ? error.code : 'crashed'; } };
  for (const type of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__']) assert.equal(codeOf([{ type }]), 'unknown_operation', type);
  for (const field of ['constructor', 'toString', 'valueOf']) assert.equal(codeOf([{ type: 'person.update', person: id.anna, set: { [field]: 'x' } }]), 'unknown_field', field);
  assert.equal(codeOf([{ type: 'entity.set', kind: 'constructor', id: 'x', snapshot: null }]), 'bad_value');
  assert.equal(codeOf([{ type: 'entity.set', kind: 'people', id: 'nobody', snapshot: null }]), 'not_found', 'there is nothing to send to the compost');
});

test('nobody can make someone public in the same edit that adds them', () => {
  const { state, id } = smallFamily();
  const admin: Actor = { userId: 'u3', name: 'Admin', role: 'admin', personId: null, anchors: [], visitor: false };
  const outcome = (ops: Op[]) => decideEdit(state, admin, ops, SETTINGS, 2026).outcome;
  assert.equal(outcome([{ type: 'person.create', ref: '$new', set: { given: 'New', privacy: 'public' } }]), 'deny');
  assert.equal(outcome([{ type: 'person.create', ref: '$new', set: { given: 'New' } }, { type: 'person.update', person: '$new', set: { privacy: 'public' } }]), 'deny');
  assert.equal(outcome([{ type: 'person.update', person: id.gran, set: { privacy: 'members' } }]), 'apply');
});
