import assert from 'node:assert/strict';
import { test } from 'vitest';

import { DATE_TEXT_MAX, formatDate, fromGedcom, isValidDate, latestYearOf, parseDate, sortKey, toGedcom, yearOf } from '../src/dates';
import { emptyState, fullName, indexOf, namesOf, scopeOf } from '../src/graph';
import { isLiving, viewOf } from '../src/privacy';
import { isStale, languagesOf, readIn, textOf, writtenIn } from '../src/text';
import { describeKinship, stepWord } from '../src/kinship';
import { cookieOf, listed, pickLang, sayFrom } from '../src/lang';
import { OpError, applyOps, describeOp } from '../src/ops';
import { decideEdit } from '../src/permissions';
import { issueText, validate } from '../src/validate';
import { say, translate } from '../src/words';
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
  // Joining someone who is already on the tree would hand them to this steward, so it is never done without review
  assert.equal(outcome(steward, [{ type: 'union.create', partners: [id.cleo, id.zed] }]), 'suggest', 'a partner from another branch cannot be pulled in');
  assert.equal(outcome(steward, [{ type: 'union.create', partners: [id.cleo, id.gran] }]), 'suggest', 'nor someone above the anchor');
  assert.equal(outcome(steward, [
    { type: 'union.create', ref: '$solo', partners: [id.cleo] },
    { type: 'union.add_partner', union: '$solo', person: id.zed },
  ]), 'suggest', 'nor by adding them to a partnership afterwards');
  assert.equal(outcome(steward, [
    { type: 'person.create', ref: '$p', set: { given: 'Partner' } },
    { type: 'union.create', ref: '$solo', partners: [id.cleo] },
    { type: 'union.add_partner', union: '$solo', person: '$p' },
  ]), 'apply', 'someone new can still be added as a partner');
  assert.equal(outcome(steward, [{ type: 'person.create', ref: '$x', set: { given: 'Loose' } }]), 'suggest', 'an unconnected person needs an admin');
  assert.equal(outcome(steward, [{ type: 'person.remove', person: id.anna }]), 'suggest', 'removing your own leaf needs an admin');
  assert.equal(outcome(steward, [{ type: 'person.remove', person: id.cleo }]), 'apply');

  // a photo is set outright or not at all: it cannot wait for review, where nobody could look at it first
  const photo = 'a'.repeat(32);
  assert.equal(outcome(steward, [{ type: 'person.update', person: id.cleo, set: { portrait: photo } }]), 'apply');
  assert.equal(outcome(steward, [{ type: 'person.update', person: id.zed, set: { portrait: photo } }]), 'deny');
  assert.equal(outcome(steward, [{ type: 'person.update', person: id.zed, set: { portrait: null } }]), 'suggest', 'taking one off can be suggested');
  assert.equal(outcome(visitor, [{ type: 'person.update', person: id.gran, set: { portrait: photo } }]), 'deny');
  assert.equal(outcome(steward, [{ type: 'person.create', ref: '$n', set: { given: 'New', portrait: photo } }, { type: 'child.link', union: id.ab, child: '$n' }]), 'deny');
  assert.equal(outcome(admin, [{ type: 'person.update', person: id.zed, set: { portrait: photo } }]), 'apply');
  // nor can it ride along with a change that has to wait: the whole edit would wait, and the photo with it
  const elsewhere: Op = { type: 'person.update', person: id.zed, set: { given: 'Z' } };
  assert.equal(outcome(steward, [elsewhere]), 'suggest');
  assert.equal(outcome(steward, [{ type: 'person.update', person: id.cleo, set: { portrait: photo } }, elsewhere]), 'deny');
  assert.equal(outcome(steward, [{ type: 'person.update', person: id.cleo, set: { portrait: null } }, elsewhere]), 'suggest', 'taking one off can wait');

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
  assert.equal(codeOf([{ type: 'person.update', person: id.zed, set: { portrait: '../../etc/passwd' } }]), 'bad_value', 'a photo is named by its id and nothing else');
  assert.equal(codeOf([{ type: 'launch.rocket' }]), 'unknown_operation');
});

test('a date holds what its kind says and nothing else, and is never longer than a date can be', () => {
  for (const good of [null, { kind: 'exact', from: '1921-03-04' }, { kind: 'between', from: '1910', to: '1935' }, { kind: 'text', text: 'before the war' }]) assert.ok(isValidDate(good), JSON.stringify(good));
  // Something sent along beside a date would be kept with it, whatever its size or shape. Here it is a nest of lists,
  // shallow enough to be made on any machine: a date is turned away for carrying it, however deep it goes.
  let deep: unknown = 'bottom';
  for (let level = 0; level < 100; level++) deep = [deep];
  const refused: [why: string, bad: unknown][] = [
    ['something beside the words', { kind: 'text', text: 'x', padding: deep }], ['a note beside a day', { kind: 'exact', from: '1921', note: 'x' }],
    ['a second day on one day', { kind: 'exact', from: '1921', to: '1930' }], ['words beside a span', { kind: 'between', from: '1910', to: '1935', text: 'x' }],
    ['too many words', { kind: 'text', text: 'x'.repeat(DATE_TEXT_MAX + 1) }], ['no words', { kind: 'text', text: '' }],
    ['a list', [{ kind: 'exact', from: '1921' }]], ['a word', 'yesterday'], ['a number', 1921],
  ];
  for (const [why, bad] of refused) assert.equal(isValidDate(bad), false, why);
  const { state, env, id } = smallFamily();
  assert.throws(() => applyOps(state, [{ type: 'fact.add', subject: { type: 'person', id: id.zed }, set: { type: 'birth', date: { kind: 'text', text: 'x', padding: deep } } }] as unknown as Op[], env), OpError);

  // A line far longer than any date is kept as words, cut to what a date may hold, and is not tried as a date: that would take minutes
  const started = Date.now();
  const long = parseDate(`x${' '.repeat(400_000)}y`);
  assert.ok(Date.now() - started < 1000, 'read at once');
  assert.ok(long?.kind === 'text' && long.text.length === DATE_TEXT_MAX && isValidDate(long));
  assert.deepEqual(parseDate('between 1910 and 1935'), { kind: 'between', from: '1910', to: '1935' }, 'and a date of ordinary length is read as before');
});

test('someone whose birth is not known to the year is taken to be living for as long as they may be', () => {
  assert.deepEqual(['1921', 'about 1921', 'before 1921', 'between 1910 and 1935', '1935 or 1910', 'after 1910', 'before the war'].map((typed) => latestYearOf(parseDate(typed))), [1921, 1921, 1921, 1935, 1935, 1940, null]);
  assert.equal(latestYearOf(null), null);

  const { state, env, id } = smallFamily();
  const born = (who: string, typed: string): Op => ({ type: 'fact.add', subject: { type: 'person', id: who }, set: { type: 'birth', date: parseDate(typed) } });
  // Zed may have been born as late as 1935, and Ben a generation after 1900. Gran is known only by a child who may be young yet.
  applyOps(state, [born(id.zed, 'between 1900 and 1935'), born(id.ben, 'after 1900'), born(id.anna, 'between 1890 and 1960')], env);
  const ix = indexOf(state);
  const living = (who: string) => isLiving(state, ix, state.people.get(who)!, SETTINGS, 2026);
  assert.deepEqual([living(id.zed), living(id.ben), living(id.anna), living(id.gran)], [true, true, true, true]);
  const stranger: Actor = { userId: null, name: 'Visitor', role: null, personId: null, anchors: [], visitor: true };
  const seen = (who: string) => viewOf(state, ix, stranger, scopeOf(state, ix, []), state.people.get(who)!, SETTINGS, 2026);
  assert.deepEqual([seen(id.zed), seen(id.ben), seen(id.gran)], ['masked', 'masked', 'masked'], 'so a stranger is not told who they are');

  // Once even the latest year is long enough ago, they are taken to have died, as before
  const old = smallFamily();
  applyOps(old.state, [born(old.id.zed, 'between 1850 and 1900'), born(old.id.ben, 'after 1850'), born(old.id.anna, 'between 1890 and 1900')], old.env);
  const oldIx = indexOf(old.state);
  assert.deepEqual([old.id.zed, old.id.ben, old.id.gran].map((who) => isLiving(old.state, oldIx, old.state.people.get(who)!, SETTINGS, 2026)), [false, false, false]);
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
  assert.deepEqual(chain('parent child partner', 'unknown', 'male').map((step) => stepWord(step)), ['parent', 'son', 'partner']);
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

/* ---------- Three languages ---------- */

test('the tree works out which of its languages a device speaks', () => {
  assert.equal(pickLang(['ru-RU', 'en']), 'ru');
  assert.equal(pickLang('he-IL,he;q=0.9,en-US;q=0.8'), 'he');
  assert.equal(pickLang('fr-FR,fr;q=0.9,ru;q=0.6,en;q=0.7'), 'en', 'the heavier of two it knows');
  assert.equal(pickLang(['iw-IL']), 'he', 'Hebrew by its old code');
  assert.equal(pickLang(['th-TH', 'de']), null, 'none of the three, so the family decides');
  assert.equal(pickLang(''), null);
  assert.equal(pickLang(null), null);
});

test('a sentence fills its gaps and counts the way each language counts', () => {
  const book = { '{n#One leaf|# leaves}': '{n#один лист|# листа|# листьев}' };
  assert.deepEqual([1, 2, 5].map((n) => sayFrom(null, 'en', '{n#One leaf|# leaves}', { n })), ['One leaf', '2 leaves', '5 leaves']);
  assert.deepEqual([1, 3, 5, 21, 22, 111].map((n) => sayFrom(book, 'ru', '{n#One leaf|# leaves}', { n })), ['один лист', '3 листа', '5 листьев', 'один лист', '22 листа', '111 листьев']);
  assert.deepEqual([1, 2, 7].map((n) => sayFrom({ x: '{n#עלה אחד|שני עלים|# עלים}' }, 'he', 'x', { n })), ['עלה אחד', 'שני עלים', '7 עלים']);
  assert.equal(sayFrom(null, 'en', '{who} signed in as {sex?her|him|them}self', { who: 'Ada', sex: 'female' }), 'Ada signed in as herself');
  assert.equal(sayFrom({}, 'ru', 'Not in the book'), 'Not in the book', 'a sentence the book lacks is said in English');
  assert.deepEqual([listed('en', ['A', 'B', 'C']), listed('ru', ['A', 'B']), listed('he', ['דוד', 'מרינה']), listed('he', ['דוד', 'Marina']), listed('en', ['A'])], ['A, B and C', 'A и B', 'דוד ומרינה', 'דוד ו-Marina', 'A']);
});

test('a cookie that is badly encoded counts as not there', () => {
  assert.equal(cookieOf('a=1; rft-language=%E0%A4%A; b=2', 'rft-language'), null);
  assert.equal(cookieOf('a=1; rft-language=he', 'rft-language'), 'he');
});

test('a date is read in any of the three languages and said in the reader\u2019s own', () => {
  const cases: [typed: string, stored: FuzzyDate, hebrew: string, russian: string][] = [
    ['4 марта 1921', { kind: 'exact', from: '1921-03-04' }, '4 במרץ 1921', '4 марта 1921'],
    ['4 במרץ 1921', { kind: 'exact', from: '1921-03-04' }, '4 במרץ 1921', '4 марта 1921'],
    ['март 1921 г.', { kind: 'exact', from: '1921-03' }, 'מרץ 1921', 'март 1921'],
    ['в мае 1945 года', { kind: 'exact', from: '1945-05' }, 'מאי 1945', 'май 1945'],
    ['04.03.1921', { kind: 'exact', from: '1921-03-04' }, '4 במרץ 1921', '4 марта 1921'],
    ['около 1890', { kind: 'about', from: '1890' }, 'בערך 1890', 'около 1890'],
    ['בערך 1890', { kind: 'about', from: '1890' }, 'בערך 1890', 'около 1890'],
    ['כ-1890', { kind: 'about', from: '1890' }, 'בערך 1890', 'около 1890'],
    ['до августа 1914', { kind: 'before', from: '1914-08' }, 'לפני אוגוסט 1914', 'до августа 1914'],
    ['לפני אוגוסט 1914', { kind: 'before', from: '1914-08' }, 'לפני אוגוסט 1914', 'до августа 1914'],
    ['после 1945', { kind: 'after', from: '1945' }, 'אחרי 1945', 'после 1945'],
    ['между мартом 1921 и маем 1922', { kind: 'between', from: '1921-03', to: '1922-05' }, 'בין מרץ 1921 למאי 1922', 'между мартом 1921 и маем 1922'],
    ['בין 1921 ל-1922', { kind: 'between', from: '1921', to: '1922' }, 'בין 1921 ל-1922', 'между 1921 и 1922'],
    ['בין 1921 לבין 1922', { kind: 'between', from: '1921', to: '1922' }, 'בין 1921 ל-1922', 'между 1921 и 1922'],
    ['с 1921 по 1922', { kind: 'between', from: '1921', to: '1922' }, 'בין 1921 ל-1922', 'между 1921 и 1922'],
    // A span, typed the way each language types one
    ['from 1939 to 1945', { kind: 'between', from: '1939', to: '1945' }, 'בין 1939 ל-1945', 'между 1939 и 1945'],
    ['מ-1939 עד 1945', { kind: 'between', from: '1939', to: '1945' }, 'בין 1939 ל-1945', 'между 1939 и 1945'],
    ['1939-1945', { kind: 'between', from: '1939', to: '1945' }, 'בין 1939 ל-1945', 'между 1939 и 1945'],
    ['about March 1921', { kind: 'about', from: '1921-03' }, 'בערך במרץ 1921', 'около марта 1921'],
    ['1921 или 1922', { kind: 'or', from: '1921', to: '1922' }, '1921 או 1922', '1921 или 1922'],
    ['1921 או 1922', { kind: 'or', from: '1921', to: '1922' }, '1921 או 1922', '1921 или 1922'],
    ['до войны', { kind: 'text', text: 'до войны' }, 'до войны', 'до войны'],
  ];
  for (const [typed, stored, hebrew, russian] of cases) {
    assert.deepEqual(parseDate(typed), stored, typed);
    assert.equal(formatDate(stored, 'he'), hebrew, `${typed} in Hebrew`);
    assert.equal(formatDate(stored, 'ru'), russian, `${typed} in Russian`);
    // What the tree says, it can read back
    for (const lang of ['en', 'he', 'ru'] as const) assert.deepEqual(parseDate(formatDate(stored, lang)), stored, `${typed}, said in ${lang} and read again`);
  }
});

test('each language names relatives by its own system', () => {
  const chain = (hows: string, sex: Sex = 'unknown', sexBefore: Sex = 'unknown'): KinStep[] => (hows.split(' ').filter(Boolean) as KinStep['how'][])
    .map((how, i, all) => ({ how, sex: i === all.length - 1 ? sex : i === all.length - 2 ? sexBefore : 'unknown' }));
  const cases: [hows: string, sex: Sex, russian: string | null, hebrew: string | null][] = [
    ['parent', 'female', 'ваша мама', 'אמא שלך'],
    ['parent parent', 'male', 'ваш дедушка', 'סבא שלך'],
    ['parent parent parent', 'female', 'ваша прабабушка', 'סבתא רבתא שלך'],
    ['child', 'male', 'ваш сын', 'הבן שלך'],
    ['child child', 'unknown', 'ваш внук или ваша внучка', 'הנכד או הנכדה שלך'],
    ['child child child', 'female', 'ваша правнучка', 'הנינה שלך'],
    ['parent child', 'female', 'ваша сестра', 'אחות שלך'],
    ['parent parent child', 'female', 'ваша тётя', 'דודה שלך'],
    // A grandmother's brother: Russian counts him as a grandfather one step to the side, Hebrew as the uncle of a parent
    ['parent parent parent child', 'male', 'ваш двоюродный дедушка', 'דוד של אחד ההורים שלך'],
    ['parent child child', 'male', 'ваш племянник', 'האחיין שלך'],
    // Hebrew has a word for a brother's grandchild that few people use. It says whose grandchild she is.
    ['parent child child child', 'female', 'ваша внучатая племянница', 'הנכדה של אח או אחות שלך'],
    ['parent parent child child', 'male', 'ваш двоюродный брат', 'בן דוד שלך'],
    ['parent parent child child', 'unknown', 'ваш двоюродный брат или ваша двоюродная сестра', 'בן דוד או בת דודה שלך'],
    ['parent parent parent child child child', 'female', 'ваша троюродная сестра', 'בת דודה מדרגה שנייה שלך'],
    // A parent's first cousin is an uncle to the side in Russian. Hebrew names him through the parent.
    ['parent parent parent child child', 'male', 'ваш двоюродный дядя', 'בן דוד של אחד ההורים שלך'],
    // A first cousin's child
    ['parent parent child child child', 'female', 'ваша двоюродная племянница', 'הבת של בן דוד או בת דודה שלך'],
    ['partner', 'female', 'ваша жена', 'בת הזוג שלך'],
    // Russian names a partner's mother by whose mother she is, the husband's or the wife's, and says it the long way when that is not known
    ['partner parent', 'female', 'мама вашего мужа или вашей жены', 'החמות שלך'],
    // Nobody says "ваш родитель"
    ['parent', 'unknown', 'один из ваших родителей', 'אחד ההורים שלך'],
    ['child parent', 'unknown', null, null],
  ];
  for (const [hows, sex, russian, hebrew] of cases) {
    assert.equal(describeKinship(chain(hows, sex), 'ru'), russian, `${hows} in Russian`);
    assert.equal(describeKinship(chain(hows, sex), 'he'), hebrew, `${hows} in Hebrew`);
  }
  assert.equal(describeKinship(chain('parent parent child partner', 'male', 'female'), 'ru'), 'муж вашей тёти');
  assert.equal(describeKinship(chain('parent parent child partner', 'male', 'female'), 'he'), 'בן הזוג של דודה שלך');
  assert.equal(describeKinship(chain('parent parent child child partner', 'female', 'male'), 'ru'), 'жена вашего двоюродного брата');
  assert.deepEqual(chain('parent child partner', 'female', 'male').map((step) => stepWord(step, 'ru')), ['родитель', 'сын', 'жена']);
  assert.deepEqual(chain('parent child partner', 'female', 'male').map((step) => stepWord(step, 'he')), ['הורה', 'בן', 'בת זוג']);

  // The words said at home, which need to know who each person along the way is: "parent:m" is a father
  const along = (text: string): KinStep[] => text.split(' ').map((part) => {
    const [how, sex] = part.split(':');
    return { how: how as KinStep['how'], sex: sex === 'f' ? 'female' : sex === 'm' ? 'male' : 'unknown' };
  });
  const said: [chain: string, russian: string, hebrew: string][] = [
    ['partner:m parent:f', 'ваша свекровь', 'החמות שלך'],
    ['partner:f parent:m', 'ваш тесть', 'החם שלך'],
    ['child:f partner:m', 'ваш зять', 'החתן שלך'],
    ['parent:f child:m partner:f', 'ваша невестка', 'הגיסה שלך'],
    ['partner:m parent:f child:f', 'сестра вашего мужа', 'הגיסה שלך'],
    ['child:m partner:m', 'муж вашего сына', 'החתן שלך'],
    ['parent:m parent:f parent:m child:f child:m', 'ваш двоюродный дядя', 'בן דוד של אבא שלך'],
    ['parent:m parent:f child:m child:f child:m', 'ваш двоюродный племянник', 'הבן של בת דודה שלך'],
    ['parent:f child:m child:f child:m', 'ваш внучатый племянник', 'הנכד של אח שלך'],
    // A grandmother's brother is the uncle of your mother
    ['parent:f parent:f parent:m child:m', 'ваш двоюродный дедушка', 'דוד של אמא שלך'],
    ['parent:f partner:m', 'муж вашей мамы', 'בן הזוג של אמא שלך'],
  ];
  for (const [chained, russian, hebrew] of said) {
    assert.equal(describeKinship(along(chained), 'ru'), russian, `${chained} in Russian`);
    assert.equal(describeKinship(along(chained), 'he'), hebrew, `${chained} in Hebrew`);
  }
  assert.deepEqual([describeKinship([], 'ru'), describeKinship([], 'he')], ['вы', 'העלה שלך']);
});

test('a change, a warning and a reason are each said in the reader\u2019s language', () => {
  const names: Record<string, string> = { p_1: 'Ada Marlow', p_2: 'Elias Marlow' };
  const nameOf = (id: string) => names[id];
  const update: Op = { type: 'person.update', person: 'p_1', set: { given: 'Ada', bio: '' } };
  assert.equal(describeOp(update, nameOf), 'Change given name, story of Ada Marlow');
  assert.equal(describeOp(update, nameOf, 'ru'), 'Ada Marlow: изменено — имя, биография');
  assert.equal(describeOp(update, nameOf, 'he'), 'שינוי בפרטים של Ada Marlow: שם פרטי, סיפור');
  const joined: Op = { type: 'union.create', partners: ['p_1', 'p_2'] };
  assert.deepEqual([describeOp(joined, nameOf), describeOp(joined, nameOf, 'ru'), describeOp(joined, nameOf, 'he')], ['Join Ada Marlow and Elias Marlow as partners', 'Новая пара: Ada Marlow и Elias Marlow', 'זוג חדש: Ada Marlow ו-Elias Marlow']);
  assert.equal(describeOp({ type: 'fact.add', subject: { type: 'person', id: 'p_1' }, set: { type: 'birth' } }, nameOf, 'ru'), 'Ada Marlow: добавлено — рождение');
  assert.equal(describeOp({ type: 'person.create', set: {} }, nameOf, 'he'), 'הוספת אדם ללא שם');

  // A warning is found once, in English, and said again to each reader
  const { state, env, id } = smallFamily();
  const { changes } = applyOps(state, [{ type: 'fact.add', subject: { type: 'person', id: id.cleo }, set: { type: 'death', date: { kind: 'exact', from: '1990' } } }], env);
  const [found] = validate(state, changes).errors;
  assert.equal(found.message, 'Cleo cannot have died (1990) before being born (2015).');
  assert.equal(issueText(found, 'ru', () => 'Клео'), 'Клео: год смерти (1990) раньше года рождения (2015).');
  assert.equal(issueText(found, 'he', () => 'קליאו'), 'קליאו: שנת הפטירה (1990) היא לפני שנת הלידה (2015).');
  assert.equal(issueText({ code: 'old', message: 'Kept from before.' }, 'ru', () => ''), 'Kept from before.');
  assert.equal(say('ru', '{name} is recorded as living {years} years.', { name: 'Ада', years: 131 }), 'Ада: по записям — 131 год жизни.');

  // A reason travels as its English sentence
  assert.equal(translate('ru', 'Sign in to suggest a change.'), 'Войдите, чтобы предложить изменение.');
  assert.equal(translate('he', 'Sign in to suggest a change.'), 'צריך להתחבר כדי להציע שינוי.');
  assert.equal(translate('ru', 'A sentence nobody wrote down'), 'A sentence nobody wrote down');
});

test('a person\u2019s words are kept in the language they were written in, and in others beside them', () => {
  const { state, env, id } = smallFamily();
  const run = (ops: Op[], lang?: 'en' | 'he' | 'ru') => applyOps(state, ops, { ...env, lang });
  const { created } = run([{ type: 'person.create', ref: '$d', set: { given: 'דוד', family: 'חננייב', bio: 'נולד בבאקו.' } }], 'he');
  const david = () => state.people.get(created.$d)!;
  assert.equal(david().lang, 'he', 'new text takes the author\u2019s language');
  assert.equal(state.people.get(id.anna)!.lang, 'en', 'and the family\u2019s first language when nothing is said');

  // Written in Russian by someone who reads the tree in Russian: kept beside the Hebrew
  run([{ type: 'person.update', person: created.$d, lang: 'ru', set: { given: 'Давид', family: 'Хананаев', living: 'yes' } }]);
  assert.equal(david().given, 'דוד', 'the original is left alone');
  assert.equal(david().living, 'yes', 'what is not words changes as always');
  assert.deepEqual([fullName(david(), 'ru'), fullName(david(), 'he'), fullName(david(), 'en')], ['Давид Хананаев', 'דוד חננייב', 'דוד חננייב']);
  assert.deepEqual(readIn(david(), 'bio', 'ru'), { text: 'נולד בבאקו.', lang: 'he' }, 'missing in Russian: shown as it was written, and said so');
  assert.deepEqual(readIn(david(), 'given', 'ru'), { text: 'Давид', lang: null });
  assert.equal(writtenIn(david(), 'given', 'en'), null);
  assert.deepEqual(languagesOf(david(), ['given', 'family', 'bio']), ['he', 'ru']);
  assert.deepEqual(namesOf(david()), [{ given: 'דוד', family: 'חננייב' }, { given: 'Давид', family: 'Хананаев' }]);

  // The original changes: the Russian was written from the old one, and says so
  assert.equal(isStale(david(), 'given', 'ru'), false);
  run([{ type: 'person.update', person: created.$d, lang: 'he', set: { given: 'דויד' } }]);
  assert.deepEqual([isStale(david(), 'given', 'ru'), isStale(david(), 'family', 'ru')], [true, false]);
  // Written again from the new one, it is up to date
  run([{ type: 'person.update', person: created.$d, lang: 'ru', set: { given: 'Давид' } }]);
  assert.equal(isStale(david(), 'given', 'ru'), false);
  // An empty text takes that language's version away
  run([{ type: 'person.update', person: created.$d, lang: 'ru', set: { given: '', family: '' } }]);
  assert.equal(david().tr.ru, undefined);
  assert.equal(textOf(david(), 'given', 'ru'), 'דויד');

  // A fact and a memory carry their own language too
  const fact = run([{ type: 'fact.add', ref: '$f', subject: { type: 'person', id: created.$d }, lang: 'ru', set: { type: 'birth', place: 'Баку' } }]).created.$f;
  run([{ type: 'fact.update', fact, lang: 'en', set: { place: 'Baku' } }]);
  assert.deepEqual([textOf(state.facts.get(fact)!, 'place', 'en'), textOf(state.facts.get(fact)!, 'place', 'he')], ['Baku', 'Баку']);
  const memory = run([{ type: 'memory.add', ref: '$m', person: created.$d, body: 'Он пел за столом.' }], 'ru').created.$m;
  run([{ type: 'memory.translate', memory, lang: 'en', body: 'He sang at the table.' }]);
  assert.deepEqual([textOf(state.memories.get(memory)!, 'body', 'en'), state.memories.get(memory)!.body], ['He sang at the table.', 'Он пел за столом.']);
  assert.throws(() => run([{ type: 'memory.translate', memory, lang: 'ru', body: 'Другое' }]), (error: unknown) => error instanceof OpError && error.code === 'bad_value', 'a memory is not rewritten in its own language');
  // Sent without a language, it is a telling in the author's language, and never a way to rewrite the memory itself
  applyOps(state, [{ type: 'memory.translate', memory, body: 'Rewritten' } as unknown as Op], { ...env, lang: 'he' });
  assert.deepEqual([state.memories.get(memory)!.body, textOf(state.memories.get(memory)!, 'body', 'he')], ['Он пел за столом.', 'Rewritten']);
  assert.throws(() => applyOps(state, [{ type: 'memory.translate', memory, body: 'Другое' } as unknown as Op], { ...env, lang: 'ru' }), (error: unknown) => error instanceof OpError && error.code === 'bad_value');
  assert.throws(() => run([{ type: 'person.create', set: { given: 'X' }, lang: 'fr' as 'en' }]), (error: unknown) => error instanceof OpError && error.code === 'bad_value');

  // The same person typed again in another language is noticed
  const twice = run([{ type: 'person.create', set: { given: 'Давид', family: 'Хананаев' } }], 'ru');
  run([{ type: 'person.update', person: created.$d, lang: 'ru', set: { given: 'Давид', family: 'Хананаев' } }]);
  const again = applyOps(state, [{ type: 'person.create', set: { given: 'Давид', family: 'Хананаев' } }], { ...env, lang: 'ru' });
  assert.ok(twice && validate(state, again.changes).warnings.some((warning) => warning.code === 'possible_duplicate'));

  // A line in history says when a change only wrote another language
  const line = describeOp({ type: 'person.update', person: created.$d, lang: 'ru', set: { given: 'Давид' } }, () => 'דויד חננייב', 'en', { langOf: () => 'he' });
  assert.equal(line, 'Write given name of דויד חננייב in Russian');
});
