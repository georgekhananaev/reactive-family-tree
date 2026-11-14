/*
 * The words about a person, in more than one language.
 *
 * A person, a fact and a memory each keep their own text (a name, a story, a
 * place) in the language it was first written in, and remember which that
 * was. The same text in another language sits beside it, together with a mark
 * of the original it was written from. When the original changes later, the
 * mark no longer fits, and that is how a translation is known to be out of
 * date without anybody having to say so.
 *
 * Reading never comes back empty-handed while there is something to show: the
 * reader's language first, then the language it was written in, then any
 * other.
 */

import { LANGS } from './lang';
import type { Lang } from './lang';
import type { Words } from './api-types';
import type { Fact, Memory, Person, Translations } from './types';

/* What can be written in more than one language, for each kind of thing. */
export const TEXT_FIELDS = {
  people: ['given', 'family', 'birthName', 'bio'],
  facts: ['place', 'value', 'note'],
  memories: ['body'],
} as const;

export type Worded = Pick<Person | Fact | Memory, 'lang' | 'tr'>;
type Fields = Record<string, unknown>;

/* A short mark of a text. Two texts with the same mark are, for this purpose, the same text. */
export function fingerprint(text: string): string {
  let mark = 0x811c9dc5;
  for (let at = 0; at < text.length; at++) mark = Math.imul(mark ^ text.charCodeAt(at), 0x01000193);
  return (mark >>> 0).toString(36);
}

const own = (thing: Worded, field: string): string => String((thing as Fields)[field] ?? '');

/* The text as it was written in exactly this language, or null if nobody has written it in that one. */
export function writtenIn(thing: Worded, field: string, lang: Lang): string | null {
  if (lang === thing.lang) return own(thing, field) || null;
  return thing.tr?.[lang]?.[field]?.text ?? null;
}

/* The text for a reader, and the language it is in when that is not the reader's own. */
export function readIn(thing: Worded, field: string, lang: Lang): { text: string; lang: Lang | null } {
  const mine = writtenIn(thing, field, lang);
  if (mine !== null) return { text: mine, lang: null };
  for (const other of [thing.lang, ...LANGS]) {
    const text = writtenIn(thing, field, other);
    if (text !== null) return { text, lang: other };
  }
  return { text: '', lang: null };
}

export const textOf = (thing: Worded, field: string, lang: Lang): string => readIn(thing, field, lang).text;

/* Written in this language from an original that has changed since. */
export function isStale(thing: Worded, field: string, lang: Lang): boolean {
  const written = lang === thing.lang ? null : thing.tr?.[lang]?.[field];
  return Boolean(written) && written?.of !== fingerprint(own(thing, field));
}

/* A copy of the thing with its text as this reader would read it. */
export function inLanguage<Thing extends Worded>(thing: Thing, fields: readonly string[], lang: Lang): Thing {
  if (lang === thing.lang && !Object.keys(thing.tr ?? {}).length) return thing;
  return { ...thing, ...Object.fromEntries(fields.map((field) => [field, textOf(thing, field, lang)])) };
}

/* The languages some text of the thing is written in, its own first. */
export function languagesOf(thing: Worded, fields: readonly string[]): Lang[] {
  return LANGS.filter((lang) => fields.some((field) => writtenIn(thing, field, lang) !== null)).sort((a, b) => Number(b === thing.lang) - Number(a === thing.lang));
}

/*
 * Write text into a thing, in a language. In its own language that is simply
 * its text. In another, the text is kept beside the original and marked with
 * it, and an empty text takes that language's version away again.
 */
export function writeIn(thing: Worded, fields: readonly string[], set: Readonly<Record<string, unknown>>, lang: Lang | undefined): void {
  if (!lang || lang === thing.lang) {
    Object.assign(thing, set);
    return;
  }
  const tr: Translations = { ...thing.tr }, mine = { ...tr[lang] };
  for (const [field, value] of Object.entries(set)) {
    if (!fields.includes(field)) (thing as Fields)[field] = value;
    else if (value === '') delete mine[field];
    else mine[field] = { text: String(value), of: fingerprint(own(thing, field)) };
  }
  if (Object.keys(mine).length) tr[lang] = mine;
  else delete tr[lang];
  thing.tr = tr;
}

/* How a thing's words reach a reader: which fields are shown in another language, and which of theirs are behind the original. */
export function wordsOf(thing: Worded, fields: readonly string[], lang: Lang): Words {
  const from: Record<string, Lang> = {};
  for (const field of fields) {
    const shown = readIn(thing, field, lang).lang;
    if (shown) from[field] = shown;
  }
  return { lang: thing.lang, from, stale: fields.filter((field) => isStale(thing, field, lang)) };
}
