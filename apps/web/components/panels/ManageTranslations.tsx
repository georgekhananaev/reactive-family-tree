'use client';

/*
 * Manage family, the translations: every piece of the family's words (names,
 * stories, places, details, notes, memories, and the family's own name, line
 * and guidelines), what each says in the language being looked at, and a box
 * to write it there. What was written from an original that has changed since
 * is marked, and can be confirmed as still right.
 */

import { LANGS } from '@reactive-family-tree/core';
import type { Lang, Op, TranslationRow, TranslationsReport } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { Fragment, memo, useDeferredValue, useState } from 'react';
import type { ChangeEvent } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { FACT_LABEL, IN_LANG, LANG_LABEL, capital } from '../card/labels';
import { Field, Select } from '../ui';

import type { Say } from './shared';
import { Loading, inWords, tryIt } from './shared';

type Show = 'all' | 'missing' | 'stale';
const SHOW: readonly (readonly [Show, WebPhrase])[] = [['all', 'All'], ['missing', 'Missing'], ['stale', 'Out of date']];

/* What a field is called inside a sentence: "the given name of Anna". */
const FIELD_WORDS: Readonly<Record<string, WebPhrase | undefined>> = {
  given: 'given name', family: 'family name', birthName: 'birth name', bio: 'story', place: 'place', value: 'detail', note: 'note', body: 'memory',
};
/* What a field is called at the head of its row. A fact's row names the kind of fact first: "Birth: place". */
const FIELD_LABELS: Readonly<Record<string, WebPhrase | undefined>> = {
  given: 'Given name', family: 'Family name', birthName: 'Born as', bio: 'Story', body: 'Memory',
  familyName: 'Name', description: 'One line about it', guidelines: 'Guidelines',
};
/* Fields that take more than a line. */
const LONG = new Set(['bio', 'body', 'note', 'guidelines']);

function labelOf(t: Say, row: TranslationRow): string {
  const word = FIELD_WORDS[row.field];
  // A fact's kind is said with the same words as on the person's card
  if (row.kind === 'facts' && row.factType && word) return t('{type}: {field}', { type: capital(t(FACT_LABEL[row.factType])), field: t(word) });
  const label = FIELD_LABELS[row.field];
  return label ? t(label) : row.field;
}

/* Write one row's text in a language. An empty text takes that language's version away. */
function write(row: TranslationRow, lang: Lang, text: string, message: string): Promise<unknown> {
  // The family's own words are settings, kept in the language the request is made in
  if (row.kind === 'family') return api.as(lang).patch('/api/settings', { [row.field]: text });
  const set = { [row.field]: text };
  const op: Op = row.kind === 'people' ? { type: 'person.update', person: row.id, lang, set }
    : row.kind === 'facts' ? { type: 'fact.update', fact: row.id, lang, set }
    : { type: 'memory.translate', memory: row.id, lang, body: text };
  return api.post('/api/edits', { ops: [op], message });
}

/* One field of one thing: its original, and its words in the language being looked at. What is typed stays in the row, so typing draws only the row again. */
const Row = memo(function Row({ row, lang }: { row: TranslationRow; lang: Lang }) {
  const app = useApp();
  const { t } = useT();
  // What has been typed here and not saved yet. Null while the box shows what is saved.
  const [typed, setTyped] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = labelOf(t, row);
  const long = LONG.has(row.field);
  const saved = row.texts[lang];
  const stale = saved?.stale ? saved : null;
  const value = typed ?? saved?.text ?? '';
  const changed = typed !== null && typed.trim() !== (saved?.text ?? '');
  const inLanguage = t(IN_LANG[lang]);

  const save = async (text: string, done: string) => {
    const word = FIELD_WORDS[row.field];
    const about = { field: word ? t(word) : label, name: row.person?.name ?? '', inLanguage };
    const message = text ? t('Write the {field} of {name} {inLanguage}', about) : t('Remove the {field} of {name} {inLanguage}', about);
    setBusy(true);
    const result = await tryIt(app, () => write(row, lang, text, message), done);
    setBusy(false);
    if (result !== null) setTyped(null);
  };
  const box = {
    dir: 'auto',
    'aria-label': label,
    placeholder: t('Write it {inLanguage}', { inLanguage }),
    value,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setTyped(event.target.value),
  } as const;

  return (
    <article className="edit">
      <header>
        <strong>{label}</strong>
        <small>{t('The original, {inLanguage}', { inLanguage: t(IN_LANG[row.lang]) })}</small>
      </header>
      <p className="note translation" dir="auto">{row.texts[row.lang]?.text || t('empty')}</p>
      {row.lang === lang ? <p className="hint-line">{t('This is the original, so there is nothing to write here.')}</p> : (
        <>
          {stale && <p className="warning">{t('Written from an earlier version. It may be out of date.')}</p>}
          {long ? <textarea className={row.field === 'note' ? 'short' : undefined} {...box} /> : <input type="text" {...box} />}
          {changed ? (
            <div className="form-actions">
              <button type="button" className="small primary" disabled={busy} onClick={() => save(value.trim(), value.trim() ? t('Saved') : t('The version {inLanguage} is removed', { inLanguage }))}>
                {t('Save')}
              </button>
              <button type="button" className="small" disabled={busy} onClick={() => setTyped(null)}>{t('Cancel')}</button>
            </div>
          ) : stale && (
            <div className="form-actions">
              <button type="button" className="small" disabled={busy} onClick={() => save(stale.text, t('Marked as up to date'))}>{t('Still right')}</button>
            </div>
          )}
        </>
      )}
    </article>
  );
});

export function TranslationsTab() {
  const { lang: reading, t } = useT();
  const { data, error } = useQuery({ queryKey: ['translations'], queryFn: () => api.get<TranslationsReport>('/api/translations') });
  // The language being looked at: the page's own to begin with
  const [lang, setLang] = useState<Lang>(reading);
  const [show, setShow] = useState<Show>('all');
  const [search, setSearch] = useState('');
  // The rows follow the search box a moment behind, so typing in it stays quick
  const looking = useDeferredValue(search.trim().toLocaleLowerCase());
  if (!data) return <Loading error={error} />;

  const wanted = (row: TranslationRow) => {
    const mine = row.texts[lang];
    if ((show === 'missing' && mine) || (show === 'stale' && !mine?.stale)) return false;
    return !looking || [row.person?.name, ...Object.values(row.texts).map((one) => one?.text)].some((text) => text?.toLocaleLowerCase().includes(looking));
  };
  // By whose words they are, in the order the server gives: the family's own first, then each person
  const groups = new Map<string, { title: string; rows: TranslationRow[] }>();
  for (const row of data.rows) {
    if (!wanted(row)) continue;
    const key = row.person?.id ?? 'family';
    const group = groups.get(key) ?? { title: row.person?.name ?? t('The family'), rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }

  return (
    <>
      {LANGS.map((one) => {
        const { missing, stale } = data.counts[one];
        return (
          <div key={one} className="row">
            <div className="main">
              <strong>{t(LANG_LABEL[one])}</strong>
              <small>{missing || stale ? t('{missing} missing, {stale} out of date', { missing, stale }) : t('All written and up to date')}</small>
            </div>
          </div>
        );
      })}
      <div className="fields translation-filters">
        <Field label={t('Show')}><Select options={inWords(t, SHOW)} value={show} onChange={(value) => setShow(value)} /></Field>
        <Field label={t('Language')}><Select options={LANGS.map((one) => [one, t(LANG_LABEL[one])] as const)} value={lang} onChange={(value) => setLang(value)} /></Field>
        <Field label={t('Search')} wide>
          <input type="search" placeholder={t('A name, or words in any language')} value={search} onChange={(event) => setSearch(event.target.value)} />
        </Field>
      </div>
      {groups.size ? [...groups].map(([key, group]) => (
        <Fragment key={key}>
          <h3>{group.title}</h3>
          {group.rows.map((row) => <Row key={`${row.kind}:${row.id}:${row.field}:${lang}`} row={row} lang={lang} />)}
        </Fragment>
      )) : <p className="empty">{data.rows.length ? t('Nothing here with these choices.') : t('Nothing is written yet. Names, stories, places and memories appear here once they are.')}</p>}
    </>
  );
}
