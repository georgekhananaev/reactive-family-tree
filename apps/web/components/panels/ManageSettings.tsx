'use client';

/* Manage family, the settings: what the family is called, who can see it, who reviews, what an AI may do, the music, and how the family writes things down. */

import type { AdminSettings, MusicMode, Visibility } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MELODIES } from 'reactive-family-tree';
import type { MelodyTrial } from 'reactive-family-tree';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';

import { Field, Select } from '../ui';

import { Check, Loading, tryIt } from './shared';

const VISIBILITY: readonly (readonly [Visibility, string])[] = [
  ['private', 'Private: only relatives who sign in'],
  ['public_masked', 'Public, living people hidden'],
  ['public', 'Public, living people shown only if they choose'],
];

const MUSIC: readonly (readonly [MusicMode, string])[] = [
  ['none', 'None, for anyone'],
  ['off', 'Off, until someone turns it on'],
  ['on', 'On, from a visitor’s first click'],
];
const MELODY_NAMES = MELODIES.map((melody) => [melody.id, melody.name] as const);

type NumberKey = 'livingAge' | 'aiWritesPerHour';
type TextKey = 'familyName' | 'description' | NumberKey;
type CheckKey = 'visitorsCanSuggest' | 'allowJoinRequests' | 'stewardsReview' | 'stewardsCanInvite' | 'allowAi' | 'allowAiDirect' | 'playMusic';

/* The settings as the form holds them: the two numbers are text while they are being typed. */
type Typed = Omit<AdminSettings, NumberKey> & Record<NumberKey, string>;

export function SettingsTab() {
  const app = useApp();
  const { data: current, error } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<AdminSettings>('/api/settings') });
  // Only what has been changed here is held. Everything else is as the server has it.
  const [changed, setChanged] = useState<Partial<Typed>>({});
  // The melody being tried out, if one is, as the calm one or as the quick tune. It plays on this page only, and stops when the settings are left.
  const [heard, setHeard] = useState<MelodyTrial | null>(null);
  const { audition } = app;
  useEffect(() => {
    audition(heard);
    return () => audition(null);
  }, [audition, heard]);
  if (!current) return <Loading error={error} />;

  const shown: Typed = { ...current, livingAge: String(current.livingAge), aiWritesPerHour: String(current.aiWritesPerHour), ...changed };
  const set = <Key extends keyof Typed>(key: Key, value: Typed[Key]) => setChanged((before) => ({ ...before, [key]: value }));
  const text = (key: TextKey, inputMode?: 'numeric') => <input type="text" inputMode={inputMode} value={shown[key]} onChange={(event) => set(key, event.target.value)} />;
  const check = (key: CheckKey, label: string) => <Check label={label} checked={shown[key]} onChange={(on) => set(key, on)} />;
  /* One of the two melodies: the list to choose from, a line about the one chosen, and a button to hear it before it is saved. */
  const melody = (key: 'melody' | 'playMelody', label: string) => {
    const quick = key === 'playMelody', listening = heard?.quick === quick;
    return (
      <>
        <Field label={label} wide>
          <Select options={MELODY_NAMES} value={shown[key]} onChange={(value) => { set(key, value); if (listening) setHeard({ melody: value, quick }); }} />
        </Field>
        <p className="hint-line">{MELODIES.find((one) => one.id === shown[key])?.about}</p>
        <div className="form-actions">
          <button type="button" aria-pressed={listening} onClick={() => setHeard(listening ? null : { melody: shown[key], quick })}>{listening ? 'Stop' : quick ? 'Listen to the quick tune' : 'Listen'}</button>
        </div>
      </>
    );
  };

  const save = async () => {
    const read: AdminSettings = { ...shown, livingAge: Number(shown.livingAge), aiWritesPerHour: Number(shown.aiWritesPerHour) };
    // Object.entries gives the names back as plain strings
    const patch = Object.fromEntries(Object.entries(read).filter(([key, value]) => value !== current[key as keyof AdminSettings]));
    if (!Object.keys(patch).length) {
      app.toast('Nothing changed');
      return;
    }
    if (await tryIt(app, () => api.patch<{ ok: boolean }>('/api/settings', patch), 'Settings saved')) setChanged({});
  };

  return (
    <>
      <h3>The family</h3>
      <div className="fields">
        <Field label="Name" wide>{text('familyName')}</Field>
        <Field label="One line about it" wide>{text('description')}</Field>
      </div>
      <h3>Who can see it</h3>
      <div className="fields">
        <Field label="Visibility" wide><Select options={VISIBILITY} value={shown.visibility} onChange={(value) => set('visibility', value)} /></Field>
        {check('visitorsCanSuggest', 'Visitors can suggest fixes')}
        {check('allowJoinRequests', 'People can ask to join')}
        <Field label="Treat as living if born less than this many years ago" wide>{text('livingAge', 'numeric')}</Field>
      </div>
      <p className="hint-line">Living people are never shown to visitors unless they choose it themselves, from their own account. Not even an admin can choose it for them.</p>
      <h3>Review</h3>
      <div className="fields">
        {check('stewardsReview', 'Stewards review suggestions for their own branch')}
        {check('stewardsCanInvite', 'Stewards can invite people in their branch')}
      </div>
      <h3>AI connections</h3>
      <div className="fields">
        {check('allowAi', 'Members can connect their own AI')}
        {check('allowAiDirect', 'Members may let their AI apply changes without a draft')}
        <Field label="Most changes one connection may make in an hour" wide>{text('aiWritesPerHour', 'numeric')}</Field>
      </div>
      <h3>Music</h3>
      <p className="hint-line">Two separate things: a melody in the background while someone looks around, and a quick tune that goes with the Play button. Either can be had without the other.</p>
      <div className="fields">
        <Field label="Melody in the background" wide><Select options={MUSIC} value={shown.music} onChange={(value) => set('music', value)} /></Field>
      </div>
      {melody('melody', 'Which melody')}
      <p className="hint-line">Where there is a melody in the background, each person turns it on or off for themselves with the note beside the year.</p>
      <div className="fields">
        {check('playMusic', 'A quick tune while the years play')}
      </div>
      {melody('playMelody', 'Made from which melody')}
      <h3>Guidelines</h3>
      <p className="hint-line">How this family writes names and dates. Shown to people when they edit, and given to every connected AI.</p>
      <textarea rows={6} value={shown.guidelines} onChange={(event) => set('guidelines', event.target.value)} />
      <div className="form-actions">
        <button type="button" className="primary" onClick={save}>Save settings</button>
      </div>
    </>
  );
}
