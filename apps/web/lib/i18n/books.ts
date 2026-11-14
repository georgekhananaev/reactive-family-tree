/* The book of a language, fetched when it is first needed: by the server for the first page, by the browser on a switch. English has none: its sentences are the keys. */

import type { Book, Lang } from '@reactive-family-tree/core';

export async function bookFor(lang: Lang): Promise<Book | null> {
  if (lang === 'he') return (await import('./he')).he;
  if (lang === 'ru') return (await import('./ru')).ru;
  return null;
}
