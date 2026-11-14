/*
 * Every piece of the family's words, in every language: what the
 * Translations tab and an admin's AI work from. One row is one field of one
 * thing (a person's given name, a fact's place, a memory), with its text in
 * each language, and whether that text was written from the original as it
 * is now.
 */

import { LANGS, TEXT_FIELDS, factsOf, fullName, indexOf, isStale, present, writtenIn } from '@reactive-family-tree/core';
import type { FactType, Lang, State, TranslationRow, TranslationsReport, Worded } from '@reactive-family-tree/core';

import { FAMILY_FIELDS, familyThing } from './settings';
import type { Settings } from './settings';

/* A row for one field, if there is anything to translate: words in some language. */
function rowOf(thing: Worded, base: Omit<TranslationRow, 'texts' | 'lang'>): TranslationRow | null {
  const texts: TranslationRow['texts'] = {};
  for (const lang of LANGS) {
    const text = writtenIn(thing, base.field, lang);
    if (text !== null) texts[lang] = { text, stale: isStale(thing, base.field, lang) };
  }
  return Object.keys(texts).length ? { ...base, lang: thing.lang, texts } : null;
}

/* Everyone's words, by person, in the order they are on the tree's record. `nameIn` is the language the people are named in. */
export function translationsOf(state: State, settings: Settings, nameIn: Lang): TranslationsReport {
  const ix = indexOf(state);
  const rows: TranslationRow[] = [];
  const add = (row: TranslationRow | null) => { if (row) rows.push(row); };

  const family = familyThing(settings);
  for (const field of FAMILY_FIELDS) add(rowOf(family, { kind: 'family', id: 'family', field, person: null, factType: null }));

  for (const p of state.people.values()) {
    if (!present(p)) continue;
    const person = { id: p.id, name: fullName(p, nameIn) };
    for (const field of TEXT_FIELDS.people) add(rowOf(p, { kind: 'people', id: p.id, field, person, factType: null }));
    for (const fact of factsOf(ix, p.id)) {
      for (const field of TEXT_FIELDS.facts) add(rowOf(fact, { kind: 'facts', id: fact.id, field, person, factType: fact.type as FactType }));
    }
    for (const memory of state.memories.values()) {
      if (present(memory) && memory.personId === p.id) add(rowOf(memory, { kind: 'memories', id: memory.id, field: 'body', person, factType: null }));
    }
  }

  const counts = Object.fromEntries(LANGS.map((lang) => [lang, {
    missing: rows.filter((row) => !row.texts[lang]).length,
    stale: rows.filter((row) => row.texts[lang]?.stale).length,
  }])) as TranslationsReport['counts'];
  return { rows, counts };
}
