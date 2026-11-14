'use client';

/* Manage family, the settings: what the family is called and the language it speaks, who can see it, who reviews, what an AI may do, the look, the music, where the family is, and how the family writes things down. */

import { LANGS, LANG_NAMES } from '@reactive-family-tree/core';
import type { AdminSettings, AdminSettingsView, Appearance, Lang, MusicMode, Visibility } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MELODIES, QUICK_TUNES, skyOver } from 'reactive-family-tree';
import type { MelodyTrial, Place } from 'reactive-family-tree';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { Field, Select } from '../ui';

import type { Say } from './shared';
import { IN_LANG } from '../card/labels';
import { Check, Loading, inWords, tryIt } from './shared';

const VISIBILITY: readonly (readonly [Visibility, WebPhrase])[] = [
  ['private', 'Private: only relatives who sign in'],
  ['public_masked', 'Public, living people hidden'],
  ['public', 'Public, living people shown only if they choose'],
];

const APPEARANCE: readonly (readonly [Appearance, WebPhrase])[] = [
  ['device', 'Light or dark, as each person’s device is set'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

const MUSIC: readonly (readonly [MusicMode, WebPhrase])[] = [
  ['none', 'None, for anyone'],
  ['off', 'Off, until someone turns it on'],
  ['on', 'On, from a visitor’s first click'],
];
/* Each language under its own name, so it can be found by someone who does not read the one shown now. */
const LANGUAGES: readonly (readonly [Lang, string])[] = LANGS.map((lang) => [lang, LANG_NAMES[lang]]);

/* A melody's name and its line are kept in English by the music itself. The books have them under that English. */
const melodyWords = (t: Say, english: string) => t(english as WebPhrase);
const namesOf = (t: Say, list: typeof MELODIES) => list.map((one) => [one.id, melodyWords(t, one.name)] as const);

/* The family's own words: written in one language, with others beside it, the way a person's are. */
const FAMILY_WORDS = ['familyName', 'description', 'guidelines'] as const;
type WordKey = (typeof FAMILY_WORDS)[number];

type NumberKey = 'livingAge' | 'aiWritesPerHour';
type DegreeKey = 'latitude' | 'longitude';
type TextKey = 'familyName' | 'description' | NumberKey | DegreeKey;
type CheckKey = 'visitorsCanSuggest' | 'allowJoinRequests' | 'stewardsReview' | 'stewardsCanInvite' | 'allowAi' | 'allowAiDirect' | 'playMusic';

/* The settings as the form holds them: the numbers are text while they are being typed, and a place that has not been given is an empty box. */
type Typed = Omit<AdminSettings, NumberKey | DegreeKey> & Record<NumberKey | DegreeKey, string>;

/* A typed latitude or longitude as the number it is kept as: to the whole degree, or nothing for an empty box. What is not a number comes back as NaN. */
const degrees = (typed: string): number | null => (typed.trim() ? Math.round(Number(typed)) : null);
const whole = (value: number | null): value is number => value !== null && Number.isFinite(value);

/* What the moon is called, by how much of it is lit and which way that is going. */
function moonName(t: Say, lit: number, waxing: boolean): string {
  if (lit < 0.02) return t('a new moon');
  if (lit > 0.98) return t('a full moon');
  if (lit < 0.4) return waxing ? t('a crescent, growing') : t('a crescent, shrinking');
  if (lit < 0.6) return waxing ? t('a half moon, growing') : t('a half moon, shrinking');
  return waxing ? t('nearly full, growing') : t('nearly full, shrinking');
}

/* The day and the time on the clocks of a timezone, in the reader's language. Nothing for a timezone this browser has not heard of. */
function clockIn(timezone: string, now: Date, lang: Lang): string | null {
  try {
    return timezone ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(now) : null;
  } catch {
    return null;
  }
}

/* What the sky is doing over the family's place right now, in a line of words: a way to see that the timezone and the place are the right ones. */
function ThereNow({ timezone, place }: { timezone: string; place: Place | null }) {
  const { lang, t } = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clock);
  }, []);
  const { lit, waxing, sunHeight, moonHeight } = skyOver(now, place), time = clockIn(timezone, now, lang);
  const moon = t('{moon} ({percent}% lit)', { moon: moonName(t, lit, waxing), percent: Math.round(lit * 100) });
  return (
    <p className="hint-line">
      {time && `${t('It is {time} there.', { time })} `}
      {sunHeight === null || moonHeight === null
        ? t('Tonight’s moon is {moon}. Give a place, and the tree shows it the way it is seen from there.', { moon })
        : `${sunHeight > 0 ? t('The sun is up.') : t('The sun is down.')} ${moonHeight > 0 ? t('The moon is {moon}, and up in the sky.', { moon }) : t('The moon is {moon}, and under the horizon.', { moon })}`}
    </p>
  );
}

export function SettingsTab() {
  const app = useApp();
  const { t } = useT();
  const { data: view, error } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<AdminSettingsView>('/api/settings') });
  // Only what has been changed here is held. Everything else is as the server has it.
  const [changed, setChanged] = useState<Partial<Typed>>({});
  // The melody being tried out, if one is, as the calm one or as the quick tune. It plays on this page only, and stops when the settings are left.
  const [heard, setHeard] = useState<MelodyTrial | null>(null);
  const { audition } = app;
  useEffect(() => {
    audition(heard);
    return () => audition(null);
  }, [audition, heard]);
  // Every timezone, and where its city is. A long list, fetched when the settings are first opened.
  const { data: zones } = useQuery({ queryKey: ['zone-places'], queryFn: async () => (await import('@/lib/zone-places')).ZONE_PLACES, staleTime: Infinity });
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

  const shown: Typed = {
    ...current, livingAge: String(current.livingAge), aiWritesPerHour: String(current.aiWritesPerHour),
    latitude: String(current.latitude ?? ''), longitude: String(current.longitude ?? ''), ...changed,
  };
  const set = <Key extends keyof Typed>(key: Key, value: Typed[Key]) => setChanged((before) => ({ ...before, [key]: value }));
  const text = (key: TextKey, inputMode?: 'numeric') => {
    const worded = key === 'familyName' || key === 'description';
    return <input type="text" inputMode={inputMode} dir={worded ? 'auto' : undefined} placeholder={worded ? placeholder(key) : undefined} value={shown[key]} onChange={(event) => set(key, event.target.value)} />;
  };
  const check = (key: CheckKey, label: string) => <Check label={label} checked={shown[key]} onChange={(on) => set(key, on)} />;
  /* One of the two choices, the calm melody or the quick tune that goes with one: the list, a line about the one chosen, and a button to hear it before it is saved. */
  const melody = (key: 'melody' | 'playMelody', label: string) => {
    const quick = key === 'playMelody', listening = heard?.quick === quick, list = quick ? QUICK_TUNES : MELODIES;
    const about = list.find((one) => one.id === shown[key])?.about;
    return (
      <>
        <Field label={label} wide>
          <Select options={namesOf(t, list)} value={shown[key]} onChange={(value) => { set(key, value); if (listening) setHeard({ melody: value, quick }); }} />
        </Field>
        <p className="hint-line">{about && melodyWords(t, about)}</p>
        <div className="form-actions">
          <button type="button" aria-pressed={listening} onClick={() => { if (!listening) app.wakeSound(); setHeard(listening ? null : { melody: shown[key], quick }); }}>{listening ? t('Stop') : quick ? t('Listen to the quick tune') : t('Listen')}</button>
        </div>
      </>
    );
  };

  /* The place as it would be saved: both numbers, or none. */
  const latitude = degrees(shown.latitude), longitude = degrees(shown.longitude);
  const place = whole(latitude) && whole(longitude) ? { latitude, longitude } : null;
  // The timezones the clocks know, and the one that is kept even if this list has not heard of it
  const zoneNames = [...new Set([...(zones?.keys() ?? []), ...(shown.timezone ? [shown.timezone] : [])])].sort();
  const zoneOptions: readonly (readonly [string, string])[] = [['', t('Not set')], ...zoneNames.map((name) => [name, name.replaceAll('_', ' ')] as const)];
  /* A timezone is also a first answer to where the family is: its city. */
  const chooseZone = (timezone: string) => {
    const city = zones?.get(timezone);
    setChanged((before) => ({ ...before, timezone, ...(city && { latitude: String(city.latitude), longitude: String(city.longitude) }) }));
  };
  /* The timezone of this device, and where it is if the browser will say. If it will not, the timezone's city stands. */
  const fromHere = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    chooseZone(timezone);
    const refused = () => app.toast(zones?.has(timezone) ? t('The browser would not say where this is, so the place is the timezone’s city.') : t('The browser would not say where this is. Type the latitude and longitude instead.'));
    if (!navigator.geolocation) return refused();
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      set('latitude', String(Math.round(coords.latitude)));
      set('longitude', String(Math.round(coords.longitude)));
    }, refused, { maximumAge: 3_600_000, timeout: 10_000 });
  };

  const save = async () => {
    if ([latitude, longitude].some(Number.isNaN)) return app.toast(t('Latitude and longitude are numbers, such as 32 and 35.'));
    if ((latitude === null) !== (longitude === null)) return app.toast(t('Give both the latitude and the longitude, or neither.'));
    const read: AdminSettings = { ...shown, livingAge: Number(shown.livingAge), aiWritesPerHour: Number(shown.aiWritesPerHour), latitude, longitude };
    // Object.entries gives the names back as plain strings
    const patch = Object.fromEntries(Object.entries(read).filter(([key, value]) => value !== current[key as keyof AdminSettings]));
    if (!Object.keys(patch).length) {
      app.toast(t('Nothing changed'));
      return;
    }
    if (!(await tryIt(app, () => api.patch<{ ok: boolean }>('/api/settings', patch), t('Settings saved')))) return;
    setChanged({});
    // Whoever sets the family's look sees it at once, in place of what this browser had chosen for itself
    if (read.appearance !== current.appearance) app.followFamily(read.appearance);
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
      <h3>{t('The look')}</h3>
      <div className="fields">
        <Field label={t('The tree opens')} wide><Select options={inWords(t, APPEARANCE)} value={shown.appearance} onChange={(value) => set('appearance', value)} /></Field>
      </div>
      <p className="hint-line">{t('For everyone who has not chosen for themselves. Each person can still switch between light and dark from their own menu, and their browser remembers it. Saving a change here also switches this browser to it.')}</p>
      <h3>{t('Music')}</h3>
      <p className="hint-line">{t('Two separate things: a melody in the background while someone looks around, and a quick tune that goes with the Play button. Either can be had without the other.')}</p>
      <div className="fields">
        <Field label={t('Melody in the background')} wide><Select options={inWords(t, MUSIC)} value={shown.music} onChange={(value) => set('music', value)} /></Field>
      </div>
      {melody('melody', t('Which melody'))}
      <p className="hint-line">{t('Where there is a melody in the background, each person turns it on or off for themselves with the note beside the year.')}</p>
      <div className="fields">
        {check('playMusic', t('A quick tune while the years play'))}
      </div>
      {melody('playMelody', t('Which quick tune'))}
      <h3>{t('Where the family is')}</h3>
      <p className="hint-line">{t('The sun and the moon on the tree are the real ones, as they stand over this place right now: the moon in tonight’s phase and turned the way it is seen from there, the sun warmer near sunrise and sunset.')}</p>
      <div className="fields">
        <Field label={t('Timezone')} wide><Select options={zoneOptions} value={shown.timezone} onChange={chooseZone} /></Field>
        <Field label={t('Latitude')}>{text('latitude')}</Field>
        <Field label={t('Longitude')}>{text('longitude')}</Field>
      </div>
      <div className="form-actions">
        <button type="button" onClick={fromHere}>{t('Use where I am now')}</button>
      </div>
      <ThereNow timezone={shown.timezone} place={place} />
      <p className="hint-line">{t('Choosing a timezone fills in its city. The place is kept to the nearest whole degree, about a hundred kilometres: enough for the sky, and not an address. North and east are plus, south and west are minus.')}</p>
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
