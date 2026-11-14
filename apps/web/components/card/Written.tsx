'use client';

/*
 * Someone's words in another language than the reader's. Where nobody has
 * written a text in the reader's language yet, the server sends it in the
 * language it was written in. These mark such text, and offer to write it in
 * the reader's own.
 */

import type { Lang, Words } from '@reactive-family-tree/core';
import type { ReactNode } from 'react';

import { useT } from '@/lib/i18n';

import { IN_LANG, LANG_LABEL } from './labels';

/* After text shown in another language: which language it is, or for someone who may change it, a way to write it in theirs. */
export function LangTag({ lang, onWrite }: { lang: Lang; onWrite?: () => void }) {
  const { lang: mine, t } = useT();
  return onWrite
    ? <button type="button" className="link" onClick={onWrite}>{t('Write it in {language}', { language: t(LANG_LABEL[mine]) })}</button>
    : <small className="lang-tag">{t(IN_LANG[lang])}</small>;
}

/*
 * A box for someone's words, with a line under it when they are written only
 * in another language (the box is then empty, and `onUse` takes that text
 * into it), or when the reader's version was written from an earlier original.
 */
export function Worded({ words, field, text = '', wide = false, onUse, children }: {
  words: Words | undefined;
  field: string;
  text?: string;
  wide?: boolean;
  onUse(text: string): void;
  children: ReactNode;
}) {
  const { t } = useT();
  const from = words?.from[field], stale = Boolean(words?.stale.includes(field));
  if (!from && !stale) return children;
  return (
    <div className={wide ? 'wide' : undefined}>
      {children}
      <p className="hint-line">
        {from ? (
          <>
            {t('Written {inLanguage}, not yet in yours.', { inLanguage: t(IN_LANG[from]) })}{' '}
            <button type="button" className="link" onClick={() => onUse(text)}>{t('Use this text')}</button>
          </>
        ) : t('Written from an earlier version. It may be out of date.')}
      </p>
    </div>
  );
}
