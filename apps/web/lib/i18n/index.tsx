'use client';

/*
 * The page in the reader's language.
 *
 * Every sentence on the page is written in English where it is used, and goes
 * through `t`. Hebrew and Russian keep books of the same sentences, by the
 * English one. Only the book of the language being read is sent to the
 * browser, and another is fetched when someone switches.
 *
 *   const { t } = useT();
 *   t('Sign in')
 *   t('{n#One leaf|# leaves}', { n: 3 })              counted the way each language counts
 *   tx('{name} is your {term}', { name: <bdi>…</bdi> })  with a piece of the page in a gap
 *
 * The English sentences are a closed list: a sentence that is not in the
 * Hebrew book does not compile, and the Russian book must have every one the
 * Hebrew book has. So nothing reaches a reader untranslated by accident.
 */

import { LANG_COOKIE, directionOf, fill, listed, sayFrom } from '@reactive-family-tree/core';
import type { Book, Lang, Values } from '@reactive-family-tree/core';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

import { api, speakTo } from '../api';

import { bookFor } from './books';

import type { WebPhrase } from './phrases';

export type { WebPhrase } from './phrases';


interface Language {
  lang: Lang;
  dir: 'ltr' | 'rtl';
  /* A sentence in the reader's language. */
  t(phrase: WebPhrase, values?: Values): string;
  /* The same, with pieces of the page allowed in the gaps. */
  tx(phrase: WebPhrase, values: Record<string, ReactNode>): ReactNode;
  /* A list read out: "A, B and C". */
  list(items: readonly string[]): string;
  /* Read the page in another language from now on. */
  choose(lang: Lang, options?: { signedIn?: boolean }): Promise<void>;
}

const LanguageContext = createContext<Language | null>(null);

/* How long a browser remembers the language it chose: a year. */
const REMEMBERED = 60 * 60 * 24 * 365;

export function LanguageProvider({ lang: first, book: firstBook, children }: { lang: Lang; book: Book | null; children: ReactNode }) {
  const [{ lang, book }, setShown] = useState({ lang: first, book: firstBook });
  const queryClient = useQueryClient();
  // Every request from now on asks for this language, so the server's words match the page's
  speakTo(lang, (english) => sayFrom(book, lang, english));

  const choose = useCallback(async (next: Lang, { signedIn = false } = {}) => {
    const nextBook = await bookFor(next);
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=${REMEMBERED}; samesite=lax`;
    document.documentElement.lang = next;
    document.documentElement.dir = directionOf(next);
    speakTo(next, (english) => sayFrom(nextBook, next, english));
    setShown({ lang: next, book: nextBook });
    // A member's choice follows them to every device, and their mail is written in it
    if (signedIn) await api.patch('/api/me/language', { language: next }).catch(() => undefined);
    // What the server said in the old language is asked for again
    await queryClient.invalidateQueries();
  }, [queryClient]);

  const value = useMemo<Language>(() => ({
    lang,
    dir: directionOf(lang),
    t: (phrase, values) => sayFrom(book, lang, phrase, values),
    tx: (phrase, values) => {
      const sentence = book?.[phrase] ?? phrase;
      const pieces = fill<ReactNode>(lang, sentence, values, (piece) => piece as ReactNode, (text) => text);
      return pieces.map((piece, index) => createElement(Fragment, { key: index }, piece));
    },
    list: (items) => listed(lang, items),
    choose,
  }), [lang, book, choose]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useT(): Language {
  const found = useContext(LanguageContext);
  if (!found) throw new Error('useT() needs a LanguageProvider around it.');
  return found;
}
