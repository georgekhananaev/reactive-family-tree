'use client';

/* Manage family, the settings: what the family is called and the language it speaks, who can see it, who reviews, what an AI may do, and how the family writes things down. How the tree looks and sounds is in its own tab, the look. */

import { LANGS, LANG_NAMES } from '@reactive-family-tree/core';
import type { AdminSettings, AdminSettingsView, Lang, Visibility } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { IN_LANG } from '../card/labels';
import { Field, Select } from '../ui';

import { Check, Loading, inWords, saveSettings } from './shared';

const VISIBILITY: readonly (readonly [Visibility, WebPhrase])[] = [
  ['private', 'Private: only relatives who sign in'],
  ['public_masked', 'Public, living people hidden'],
  ['public', 'Public, living people shown only if they choose'],
];

/* Each language under its own name, so it can be found by someone who does not read the one shown now. */
const LANGUAGES: readonly (readonly [Lang, string])[] = LANGS.map((lang) => [lang, LANG_NAMES[lang]]);

/* The family's own words: written in one language, with others beside it, the way a person's are. */
const FAMILY_WORDS = ['familyName', 'description', 'guidelines'] as const;
type WordKey = (typeof FAMILY_WORDS)[number];

type NumberKey = 'livingAge' | 'aiWritesPerHour';
type TextKey = 'familyName' | 'description' | NumberKey;
type CheckKey = 'visitorsCanSuggest' | 'allowJoinRequests' | 'stewardsReview' | 'stewardsCanInvite' | 'allowAi' | 'allowAiDirect';

/* The settings as the form holds them: the numbers are text while they are being typed. */
type Typed = Omit<AdminSettings, NumberKey> & Record<NumberKey, string>;

export function SettingsTab() {
  const app = useApp();
  const { t } = useT();
  const { data: view, error } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<AdminSettingsView>('/api/settings') });
  // Only what has been changed here is held. Everything else is as the server has it.
  const [changed, setChanged] = useState<Partial<Typed>>({});
  if (!view) return <Loading error={error} />;

  const { words, ...saved } = view;
  // The family's words not yet written in the reader's language start as an empty box, with the original faint inside it
  const unwritten = (key: WordKey) => words.from[key];
  const current: AdminSettings = { ...saved, ...Object.fromEntries(FAMILY_WORDS.filter(unwritten).map((key) => [key, ''])) };
  const placeholder = (key: WordKey) => (unwritten(key) ? saved[key] : undefined);
  /* Says in which language the family wrote what the box shows faintly. */
  const fromHint = (keys: readonly WordKey[]) => {
    const from = keys.map(unwritten).find(Boolean);
    return from && <p className="hint-line">{t('Written {inLanguage}, not yet in yours.', { inLanguage: t(IN_LANG[from]) })}</p>;
  };

  const shown: Typed = { ...current, livingAge: String(current.livingAge), aiWritesPerHour: String(current.aiWritesPerHour), ...changed };
  const set = <Key extends keyof Typed>(key: Key, value: Typed[Key]) => setChanged((before) => ({ ...before, [key]: value }));
  const text = (key: TextKey, inputMode?: 'numeric') => {
    const worded = key === 'familyName' || key === 'description';
    return <input type="text" inputMode={inputMode} dir={worded ? 'auto' : undefined} placeholder={worded ? placeholder(key) : undefined} value={shown[key]} onChange={(event) => set(key, event.target.value)} />;
  };
  const check = (key: CheckKey, label: string) => <Check label={label} checked={shown[key]} onChange={(on) => set(key, on)} />;

  const save = async () => {
    const read: AdminSettings = { ...shown, livingAge: Number(shown.livingAge), aiWritesPerHour: Number(shown.aiWritesPerHour) };
    if (await saveSettings(app, t, read, current)) setChanged({});
  };

  return (
    <>
      <h3>{t('The family')}</h3>
      <div className="fields">
        <Field label={t('Name')} wide>{text('familyName')}</Field>
        <Field label={t('One line about it')} wide>{text('description')}</Field>
      </div>
      {fromHint(['familyName', 'description'])}
      <div className="fields">
        <Field label={t('Language')} wide><Select options={LANGUAGES} value={shown.language} onChange={(value) => set('language', value)} /></Field>
      </div>
      <p className="hint-line">{t('The language the tree speaks to someone who has not chosen one, and whose device speaks none of these.')}</p>
      <h3>{t('Who can see it')}</h3>
      <div className="fields">
        <Field label={t('Visibility')} wide><Select options={inWords(t, VISIBILITY)} value={shown.visibility} onChange={(value) => set('visibility', value)} /></Field>
        {check('visitorsCanSuggest', t('Visitors can suggest fixes'))}
        {check('allowJoinRequests', t('People can ask to join'))}
        <Field label={t('Treat as living if born less than this many years ago')} wide>{text('livingAge', 'numeric')}</Field>
      </div>
      <p className="hint-line">{t('Living people are never shown to visitors unless they choose it themselves, from their own account. Not even an admin can choose it for them.')}</p>
      <h3>{t('Review')}</h3>
      <div className="fields">
        {check('stewardsReview', t('Stewards review suggestions for their own branch'))}
        {check('stewardsCanInvite', t('Stewards can invite people in their branch'))}
      </div>
      <h3>{t('AI connections')}</h3>
      <div className="fields">
        {check('allowAi', t('Members can connect their own AI'))}
        {check('allowAiDirect', t('Members may let their AI apply changes without a draft'))}
        <Field label={t('Most changes one connection may make in an hour')} wide>{text('aiWritesPerHour', 'numeric')}</Field>
      </div>
      <p className="hint-line">{t('Light and dark, the moon, where the family is and the music are under the look.')}</p>
      <h3>{t('Guidelines')}</h3>
      <p className="hint-line">{t('How this family writes names and dates. Shown to people when they edit, and given to every connected AI.')}</p>
      <textarea rows={6} dir="auto" placeholder={placeholder('guidelines')} value={shown.guidelines} onChange={(event) => set('guidelines', event.target.value)} />
      {fromHint(['guidelines'])}
      <div className="form-actions">
        <button type="button" className="primary" onClick={save}>{t('Save settings')}</button>
      </div>
    </>
  );
}
