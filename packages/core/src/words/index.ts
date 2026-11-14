/* What the rules say, in the language of whoever reads it. */

import { sayFrom } from '../lang';
import type { Book, Lang, Values } from '../lang';

import { he } from './he';
import { ru } from './ru';

/* Every sentence the rules can say, as it is written in English. */
export type Phrase = keyof typeof he;

const BOOKS: Record<Lang, Book | null> = { en: null, he, ru };

export const say = (lang: Lang, phrase: Phrase, values?: Values): string => sayFrom(BOOKS[lang], lang, phrase, values);

/*
 * The same for a sentence that was kept as English text and has no gaps: a
 * reason attached to a decision, an error on its way out. One the books do
 * not know comes back as it is.
 */
export const translate = (lang: Lang, english: string): string => BOOKS[lang]?.[english] ?? english;
