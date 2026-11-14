/* What the server says, in the language of whoever it says it to. */

import { sayFrom, translate } from '@reactive-family-tree/core';
import type { Book, Lang, Values } from '@reactive-family-tree/core';

import { he } from './he';
import { ru } from './ru';

/* Every sentence the server can say to a person, as it is written in English. */
export type ServerPhrase = keyof typeof he;

const BOOKS: Record<Lang, Book | null> = { en: null, he, ru };

export const tell = (lang: Lang, phrase: ServerPhrase, values?: Values): string => sayFrom(BOOKS[lang], lang, phrase, values);

/*
 * An English sentence in another language, whichever book has it: the
 * server's, or the rules'. With `values`, the sentence is the English one
 * with its gaps still open. One that neither book knows is said as it is.
 */
export function inLanguage(lang: Lang, english: string, values?: Values): string {
  if (values) return sayFrom(BOOKS[lang], lang, english, values);
  return BOOKS[lang]?.[english] ?? translate(lang, english);
}
