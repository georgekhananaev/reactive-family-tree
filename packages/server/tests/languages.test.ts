/*
 * Three languages, end to end: the tree answers each reader in the language
 * they read it in, keeps a person's words in every language they are written
 * in, says its own sentences (errors, warnings, the inbox, mail) in the
 * reader's language, and shows an admin what is missing.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, expect, test, vi } from 'vitest';

import { browser, startDemo } from '../src/testing';
import type { Demo } from '../src/testing';
import { he as serverBook } from '../src/words/he';
import { ru as serverInRussian } from '../src/words/ru';
import { he as rulesBook } from '../../core/src/words/he';
import { ru as rulesInRussian } from '../../core/src/words/ru';

let demo: Demo;
beforeAll(async () => { demo = await startDemo(); });
afterAll(() => demo.close());

/* What the API sends, read loosely. */
interface Detail { given: string; family: string; name: string; bio: string; words: { lang: string; from: Record<string, string>; stale: string[] }; memories: { id: string; body: string; words: { from: Record<string, string> } }[] }

test('the tree answers in the language a reader asks for, remembers, or speaks', async () => {
  const lang = async (who: ReturnType<typeof browser>) => (await who.get('/api/session')).data.lang;
  const russian = browser(demo.app, undefined, 'ru-RU,ru;q=0.9,en;q=0.5');
  expect(await lang(russian), 'a device set to Russian').toBe('ru');
  russian.remember('rft-language', 'he');
  expect(await lang(russian), 'a choice the browser remembers comes before the device').toBe('he');
  russian.reads('en');
  expect(await lang(russian), 'and what the page asks for comes before both').toBe('en');

  const elsewhere = browser(demo.app, undefined, 'fr-FR,fr;q=0.9');
  expect(await lang(elsewhere), 'none of the three: the family’s language').toBe('en');
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  expect((await helen.patch('/api/settings', { language: 'he' })).status).toBe(200);
  expect([await lang(elsewhere), (await elsewhere.get('/api/session')).data.settings.language]).toEqual(['he', 'he']);
  expect((await helen.patch('/api/settings', { language: 'fr' })).status).toBe(400);
  await helen.patch('/api/settings', { language: 'en' });

  // A member's own choice is kept with their account, and follows them to any browser
  expect((await helen.patch('/api/me/language', { language: 'ru' })).status).toBe(200);
  expect([(await helen.get('/api/session')).data.user.language, await lang(helen)]).toEqual(['ru', 'ru']);
  const another = browser(demo.app, undefined, 'en-GB');
  await another.signInAs('helen');
  expect(await lang(another), 'the account’s choice comes before the device').toBe('ru');
  expect((await helen.patch('/api/me/language', { language: 'de' })).status).toBe(400);
  await helen.patch('/api/me/language', { language: null });
  expect(await lang(helen)).toBe('en');
});

test('words written in another language are kept beside the original, and shown where the reader’s are missing', async () => {
  const iris = demo.idOf('Iris');
  const nora = browser(demo.app), helen = browser(demo.app);
  await nora.signInAs('nora');
  await helen.signInAs('helen');
  nora.reads('ru');
  const english = (await helen.get(`/api/people/${iris}`)).data as Detail;

  // Nora reads the tree in Russian and writes Iris's name in it. Iris is in her branch, so it is saved at once.
  const saved = await nora.edit([{ type: 'person.update', person: iris, lang: 'ru', set: { given: 'Ирис', bio: 'Играет на виолончели.' } }]);
  expect(saved.data.status).toBe('applied');
  const russian = (await nora.get(`/api/people/${iris}`)).data as Detail;
  expect([russian.given, russian.family, russian.bio]).toEqual(['Ирис', english.family, 'Играет на виолончели.']);
  expect(russian.words.lang, 'Iris was first written in English').toBe('en');
  expect(russian.words.from, 'her family name is not written in Russian, so it is shown as it was written').toEqual(english.family ? { family: 'en' } : {});
  expect(((await helen.get(`/api/people/${iris}`)).data as Detail).given, 'the English is left as it was').toBe(english.given);
  const leaf = (await nora.get('/api/tree')).data.people.find((p: { id: string }) => p.id === iris);
  expect(leaf.given, 'the tree names her in Russian').toBe('Ирис');

  // She is found by either name, however it is typed
  const found = async (who: ReturnType<typeof browser>, q: string) => (await who.get(`/api/people?q=${encodeURIComponent(q)}`)).data.people.map((hit: { id: string; name: string }) => hit.id);
  expect(await found(helen, 'ирис'), 'searched in Russian by someone reading English').toContain(iris);
  expect(await found(nora, english.given.toUpperCase())).toContain(iris);

  // History says what happened in the reader's language
  const history = (await nora.get(`/api/edits?which=activity&person=${iris}`)).data.edits;
  expect(history[0].lines[0].text).toBe(`Ирис ${english.family}: имя, биография — на русском`.replace(/ +:/, ':'));
  helen.reads('he');
  expect((await helen.get(`/api/edits?which=activity&person=${iris}`)).data.edits[0].lines[0].text).toBe(`כתיבת שם פרטי, סיפור של ${english.given} ${english.family} ברוסית`.replace('  ', ' '));
  helen.reads(null);

  // The original changes: the Russian was written from the old one
  await helen.edit([{ type: 'person.update', person: iris, set: { given: `${english.given} Rose` } }]);
  expect(((await nora.get(`/api/people/${iris}`)).data as Detail).words.stale).toEqual(['given']);
  await nora.edit([{ type: 'person.update', person: iris, lang: 'ru', set: { given: 'Ирис Роуз' } }]);
  expect(((await nora.get(`/api/people/${iris}`)).data as Detail).words.stale).toEqual([]);
  await helen.edit([{ type: 'person.update', person: iris, set: { given: english.given } }]);

  // A memory is told again in another language by those who may, and by nobody else
  const memory = (await nora.edit([{ type: 'memory.add', person: iris, body: 'Она пела, когда шёл дождь.' }])).data;
  const told = ((await nora.get(`/api/people/${iris}`)).data as Detail).memories.find((m) => m.body.startsWith('Она'));
  expect(memory.status).toBe('applied');
  expect(((await helen.get(`/api/people/${iris}`)).data as Detail).memories.find((m) => m.id === told?.id)?.words.from).toEqual({ body: 'ru' });
  expect((await helen.edit([{ type: 'memory.translate', memory: told?.id ?? '', lang: 'en', body: 'She sang when it rained.' }])).data.status).toBe('applied');
  expect(((await helen.get(`/api/people/${iris}`)).data as Detail).memories.find((m) => m.id === told?.id)?.body).toBe('She sang when it rained.');
  const daniel = browser(demo.app);
  await daniel.signInAs('daniel');
  expect((await daniel.edit([{ type: 'memory.translate', memory: told?.id ?? '', lang: 'he', body: 'היא שרה' }])).status, 'someone with no tie to the memory').toBe(403);
});

test('errors, warnings and reasons reach each reader in their language', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  helen.reads('ru');
  expect((await helen.patch('/api/settings', { livingAge: 5 })).data.error).toBe('Введите целое число лет от 80 до 130.');
  expect((await helen.patch('/api/settings', { nonsense: 1 })).data.error).toBe('Настройки «nonsense» нет.');
  const nora = demo.idOf('Nora');
  const died = [{ type: 'fact.add', subject: { type: 'person', id: nora }, set: { type: 'death', date: { kind: 'exact', from: '1900' } } }];
  expect((await helen.post('/api/edits', { mode: 'dry', ops: died })).data.error).toBe('Nora Bell: год смерти (1900) раньше года рождения (1975).');
  helen.reads('he');
  expect((await helen.get('/api/people/nobody')).data.error).toBe('האדם הזה לא בעץ, או שהוא מוסתר.');
  expect((await helen.post('/api/edits', { mode: 'dry', ops: died })).data.error).toBe('Nora Bell: שנת הפטירה (1900) היא לפני שנת הלידה (1975).');

  // A visitor who may not suggest is told why, in their language
  await helen.patch('/api/settings', { visitorsCanSuggest: false });
  const visitor = browser(demo.app, undefined, 'ru');
  const refused = await visitor.post('/api/edits', { mode: 'dry', ops: [{ type: 'person.update', person: nora, set: { given: 'X' } }] });
  expect(refused.data.reasons).toEqual(['Войдите, чтобы предложить изменение.']);
  await helen.patch('/api/settings', { visitorsCanSuggest: true });
});

test('the inbox, mail and the family’s own name speak the reader’s language', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  // The demo's suggestions told the reviewers. Each reads the notice in their own language, whenever they read it.
  helen.reads('he');
  const notices = (await helen.get('/api/notifications')).data.notifications.map((n: { body: string }) => n.body);
  expect(notices.some((body: string) => body.includes('הצעה חדשה מאת'))).toBe(true);
  helen.reads('ru');
  expect((await helen.get('/api/notifications')).data.notifications.some((n: { body: string }) => n.body.includes('предлагает изменение:'))).toBe(true);

  // A sign-in link is written in the language the member chose
  await helen.patch('/api/me/language', { language: 'ru' });
  const letters = vi.spyOn(demo.app.mailer, 'send');
  await browser(demo.app).post('/api/auth/sign-in/magic-link', { email: 'helen@marlow.example', callbackURL: '/' });
  await vi.waitFor(() => expect(letters).toHaveBeenCalled());
  expect(letters.mock.calls[0]?.[0].subject).toMatch(/^Вход: /);
  expect(letters.mock.calls[0]?.[0].text).toMatch(/^Откройте эту ссылку/);
  letters.mockRestore();
  await helen.patch('/api/me/language', { language: null });

  // The family's name, written in Hebrew by an admin reading in Hebrew, is kept beside the English
  helen.reads('he');
  expect((await helen.patch('/api/settings', { familyName: 'משפחת מרלו' })).status).toBe(200);
  const named = async (lang: string) => { const who = browser(demo.app, undefined, lang); return (await who.get('/api/session')).data.settings.familyName; };
  expect([await named('he'), await named('en'), await named('ru')]).toEqual(['משפחת מרלו', 'Marlow family', 'Marlow family']);
  expect((await helen.get('/api/tree')).data.family.name).toBe('משפחת מרלו');
  helen.reads('ru');
  expect((await helen.get('/api/settings')).data.words.from, 'not written in Russian yet').toEqual({ familyName: 'en', description: 'en', guidelines: 'en' });
  helen.reads('he');
  expect((await helen.patch('/api/settings', { familyName: '' })).status, 'an empty version takes it away').toBe(200);
  expect(await named('he')).toBe('Marlow family');
});

test('an admin sees every piece of the family’s words in every language, and nobody else does', async () => {
  const helen = browser(demo.app), nora = browser(demo.app);
  await helen.signInAs('helen');
  await nora.signInAs('nora');
  expect((await nora.get('/api/translations')).status).toBe(403);
  const report = (await helen.get('/api/translations')).data;
  const iris = demo.idOf('Iris');
  const given = report.rows.find((row: { id: string; field: string }) => row.id === iris && row.field === 'given');
  expect(given.lang).toBe('en');
  expect(Object.keys(given.texts).sort()).toEqual(['en', 'ru']);
  expect(report.rows.some((row: { kind: string; field: string }) => row.kind === 'family' && row.field === 'familyName')).toBe(true);
  expect(report.counts.he.missing).toBeGreaterThan(report.counts.ru.missing);
  expect(report.counts.en.missing, 'the demo family was written in English, except what was added here in Russian').toBeGreaterThan(0);
});

test('every sentence the server can say to a person is in the books', () => {
  // Errors are thrown in English and said in the reader's language on the way out. One missing from the books would reach them in English.
  const known = new Set([...Object.keys(serverBook), ...Object.keys(rulesBook)]);
  const sources = ['../src', '../../core/src', '../../mcp/src'].flatMap((dir) => readdirSync(new URL(dir, import.meta.url)).filter((name) => name.endsWith('.ts')).map((name) => join(new URL(dir, import.meta.url).pathname, name)));
  const missing: string[] = [];
  const thrown = /\b(?:badRequest|forbidden|notFound|conflict|invalid|tooMany|signInFirst|suggest|deny)\(\s*'((?:[^'\\]|\\.)+)'/g;
  const failed = /\bfail\('[a-z_]+',\s*'((?:[^'\\]|\\.)+)'/g;
  for (const file of sources) {
    const text = readFileSync(file, 'utf8');
    for (const pattern of [thrown, failed]) {
      for (const match of text.matchAll(pattern)) {
        const sentence = (match[1] ?? '').replace(/\\'/g, "'");
        if (!known.has(sentence)) missing.push(`${file.split('/packages/')[1]}: ${sentence}`);
      }
    }
  }
  expect(missing).toEqual([]);
});

test('history says in words what a field holds, and a refusal names the field as its reader knows it', async () => {
  const helen = browser(demo.app);
  await helen.signInAs('helen');
  const iris = demo.idOf('Iris');
  expect((await helen.edit([{ type: 'person.update', person: iris, set: { privacy: 'members' } }])).data.status).toBe('applied');
  const change = async (lang: string) => { helen.reads(lang); return (await helen.get(`/api/edits?which=activity&person=${iris}`)).data.edits[0].lines[0].fields[0]; };
  // Never "default" and "members", which are the program's own words for them
  expect(await change('en')).toMatchObject({ was: 'Follows the family\u2019s setting', to: 'Relatives only' });
  expect(await change('ru')).toMatchObject({ was: serverInRussian['Follows the family\u2019s setting'], to: serverInRussian['Relatives only'] });
  expect(await change('he')).toMatchObject({ was: serverBook['Follows the family\u2019s setting'], to: serverBook['Relatives only'] });
  await helen.edit([{ type: 'person.update', person: iris, set: { privacy: 'default' } }]);

  helen.reads('ru');
  const refused = (await helen.edit([{ type: 'person.update', person: iris, set: { sex: 'robot' as 'male' } }])).data.error;
  expect(refused, 'the field by its Russian name').toContain(rulesInRussian.sex);
  expect(refused).not.toMatch(/[a-z]{3,}/);
  helen.reads('en');
  expect((await helen.edit([{ type: 'person.update', person: iris, set: { sex: 'robot' as 'male' } }])).data.error).toBe('"sex" has a value that is not allowed.');
});

test('a language cookie that is badly encoded is ignored, and the tree still answers', async () => {
  const visitor = browser(demo.app, undefined, 'ru');
  visitor.remember('rft-language', '%E0%A4%A');
  const answer = await visitor.get('/api/session');
  expect([answer.status, answer.data.lang], 'the device\u2019s language, as if there were no cookie').toEqual([200, 'ru']);
});

