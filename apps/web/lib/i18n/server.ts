/*
 * The page's words for a part of the page drawn on the server: a person's own
 * page, the page for an address that leads nowhere, their titles. The language
 * is chosen the same way as for every answer the server gives.
 */

import { LANG_COOKIE, chooseLang, directionOf, listed, sayFrom } from '@reactive-family-tree/core';
import type { Lang, Values } from '@reactive-family-tree/core';
import { cookies, headers } from 'next/headers';

import { getApp } from '@/lib/server';

import { bookFor } from './books';
import type { WebPhrase } from './phrases';

/* How a shared link's preview names the language it is written in. */
export const OG_LOCALE: Record<Lang, string> = { en: 'en_US', he: 'he_IL', ru: 'ru_RU' };

/* The language this request is read in. */
export async function requestLang(): Promise<Lang> {
  const [{ store }, asked, said] = await Promise.all([getApp(), cookies(), headers()]);
  return chooseLang({ remembered: asked.get(LANG_COOKIE)?.value, device: said.get('accept-language') }, store.settings.language);
}

export async function getT(): Promise<{ lang: Lang; dir: 'ltr' | 'rtl'; t(phrase: WebPhrase, values?: Values): string; list(items: readonly string[]): string }> {
  const lang = await requestLang();
  const book = await bookFor(lang);
  return { lang, dir: directionOf(lang), t: (phrase, values) => sayFrom(book, lang, phrase, values), list: (items) => listed(lang, items) };
}
