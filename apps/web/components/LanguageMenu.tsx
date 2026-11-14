'use client';

/*
 * Choosing the language the page is read in. It sits among the tools at the
 * top for everyone, signed in or not, and each language is offered under its
 * own name, so it can be found by someone who cannot read the one shown now.
 */

import { LANGS, LANG_NAMES } from '@reactive-family-tree/core';
import type { Lang } from '@reactive-family-tree/core';
import { useEffect, useId, useRef, useState } from 'react';

import { useT } from '@/lib/i18n';

import { Icon } from './Icon';
import { arrowThrough } from './ui';

/* The language in two or three letters, on the button itself. */
const SHORT: Record<Lang, string> = { en: 'EN', he: 'עב', ru: 'РУ' };

export function LanguageMenu({ signedIn }: { signedIn: boolean }) {
  const { lang, t, choose } = useT();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const list = useId();
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  // A press anywhere else, or Escape, puts the list away
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape, true);
    box.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape, true);
    };
  }, [open]);

  const pick = async (next: Lang) => {
    setOpen(false);
    if (next === lang) return;
    setBusy(true);
    try {
      await choose(next, { signedIn });
    } finally {
      setBusy(false);
      button.current?.focus();
    }
  };

  return (
    <div ref={box} className="languages">
      <button
        ref={button} id="languageOpen" type="button" className="tool" aria-haspopup="menu" aria-expanded={open} aria-controls={list}
        aria-label={`${t('Language')}: ${LANG_NAMES[lang]}`} title={t('Choose a language')} aria-busy={busy} onClick={() => setOpen(!open)}
      >
        <Icon name="globe" /><span lang={lang}>{SHORT[lang]}</span>
      </button>
      <div id={list} className={open ? 'menu languages-menu open' : 'menu languages-menu'} role="menu" aria-label={t('Language')} hidden={!open}
        onKeyDown={(event) => arrowThrough(event, [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')])}>
        {LANGS.map((one) => (
          <button key={one} type="button" role="menuitemradio" aria-checked={one === lang} lang={one} onClick={() => void pick(one)}>
            {LANG_NAMES[one]}
          </button>
        ))}
      </div>
    </div>
  );
}
