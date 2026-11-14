/*
 * Someone's words as a card or a page shows them. Words in another language
 * than the reader's are marked with it, so they are read out in that language
 * and set the right way round. Drawn on the server and in the browser alike.
 */

import type { FactView, Lang } from '@reactive-family-tree/core';
import type { ReactNode } from 'react';

/* Text in the language named. With no language it is in the page's own. */
export function InLang({ text, lang }: { text: string; lang?: Lang }) {
  return lang ? <span lang={lang} dir="auto">{text}</span> : text;
}

/* What a fact says: its detail, when and where, one after another. */
export function factPieces(fact: FactView): ReactNode[] {
  const { value, place } = fact.words.from;
  const pieces = [
    fact.value && <InLang key="value" text={fact.value} lang={value} />,
    fact.dateText,
    fact.place && <InLang key="place" text={fact.place} lang={place} />,
  ].filter(Boolean);
  return pieces.flatMap((piece, index) => (index ? [', ', piece] : [piece]));
}
