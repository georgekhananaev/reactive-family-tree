'use client';

/*
 * Manage family, the look: how the tree looks and sounds for everyone. Light
 * or dark, the moon over it after dark, the pond beside it, where the family
 * is (which the sun and the moon are drawn from), and the music.
 */

import type { AdminSettings, AdminSettingsView, Appearance, Lang, MoonMode, MusicMode, PondMode } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MELODIES, QUICK_TUNES, moonFor, skyOver } from 'reactive-family-tree';
import type { MelodyTrial, Place, Sky } from 'reactive-family-tree';

import { api } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import { placeOf } from '@/lib/appearance';
import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import { Field, Select } from '../ui';

import type { Say } from './shared';
import { Check, Loading, inWords, saveSettings } from './shared';

const APPEARANCE: readonly (readonly [Appearance, WebPhrase])[] = [
  ['device', 'Light or dark, as each person’s device is set'],
  ['sun', 'By the sun: light by day, dark after sunset where the family is'],
  ['light', 'Light'],
  ['dark', 'Dark'],
];

const MOON: readonly (readonly [MoonMode, WebPhrase])[] = [
  ['tonight', 'Tonight’s real moon'],
  ['full', 'Always full'],
  ['day', 'The moon of a day that matters'],
  ['none', 'No moon, only the stars'],
];

const POND: readonly (readonly [PondMode, WebPhrase])[] = [
  ['garden', 'A garden pond with a bridge and a pine'],
  ['koi', 'A small koi pond with a stone lantern'],
  ['none', 'No pond'],
];

const MUSIC: readonly (readonly [MusicMode, WebPhrase])[] = [
  ['none', 'None, for anyone'],
  ['off', 'Off, until someone turns it on'],
  ['on', 'On, from a visitor’s first click'],
];

/* A melody's name and its line are kept in English by the music itself. The books have them under that English. */
const melodyWords = (t: Say, english: string) => t(english as WebPhrase);
const namesOf = (t: Say, list: typeof MELODIES) => list.map((one) => [one.id, melodyWords(t, one.name)] as const);

type DegreeKey = 'latitude' | 'longitude';
type CheckKey = 'playMusic';
/* The settings as the form holds them: a place that has not been given is an empty box, and a typed one is text until it is saved. */
type Typed = Omit<AdminSettings, DegreeKey> & Record<DegreeKey, string>;

/* A typed latitude or longitude as the number it is kept as: to the whole degree, or nothing for an empty box. What is not a number comes back as NaN. */
const degrees = (typed: string): number | null => (typed.trim() ? Math.round(Number(typed)) : null);
const whole = (value: number | null): value is number => value !== null && Number.isFinite(value);

/* What the moon is called, by how much of it is lit and which way that is going, with how much of it is lit. */
function moonName(t: Say, { lit, waxing }: Pick<Sky, 'lit' | 'waxing'>): string {
  const name = lit < 0.02 ? t('a new moon') : lit > 0.98 ? t('a full moon')
    : lit < 0.4 ? (waxing ? t('a crescent, growing') : t('a crescent, shrinking'))
      : lit < 0.6 ? (waxing ? t('a half moon, growing') : t('a half moon, shrinking'))
        : waxing ? t('nearly full, growing') : t('nearly full, shrinking');
  return t('{moon} ({percent}% lit)', { moon: name, percent: Math.round(lit * 100) });
}

/* The day and the time on the clocks of a timezone, in the reader's language. Nothing for a timezone this browser has not heard of. */
function clockIn(timezone: string, now: Date, lang: Lang): string | null {
  try {
    return timezone ? new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : lang, { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(now) : null;
  } catch {
    return null;
  }
}

/* The time, to the half minute, for lines that say what the sky is doing now. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clock);
  }, []);
  return now;
}

/* What the sky is doing over the family's place right now, in a line of words: a way to see that the timezone and the place are the right ones. The moon's phase is said with the moon. */
function ThereNow({ timezone, place }: { timezone: string; place: Place | null }) {
  const { lang, t } = useT();
  const now = useNow();
  const { sunHeight, moonHeight } = skyOver(now, place), time = clockIn(timezone, now, lang);
  return (
    <p className="hint-line">
      {time && `${t('It is {time} there.', { time })} `}
      {sunHeight === null || moonHeight === null
        ? t('Give a place, and the tree shows the sun and the moon the way they are seen from there.')
        : `${sunHeight > 0 ? t('The sun is up.') : t('The sun is down.')} ${moonHeight > 0 ? t('The moon is up in the sky.') : t('The moon is under the horizon.')}`}
    </p>
  );
}

/* What the moon the family chose looks like: tonight's as it is now, a day's as it was that night. */
function MoonNow({ mode, day, place }: { mode: MoonMode; day: string; place: Place | null }) {
  const { t } = useT();
  const now = useNow();
  if (mode === 'tonight') return <p className="hint-line">{t('Tonight it is {moon}.', { moon: moonName(t, skyOver(now, place)) })}</p>;
  if (mode !== 'day' || !day) return null;
  const shown = moonFor({ day }, place, now);
  return shown && <p className="hint-line">{t('On that night the moon was {moon}.', { moon: moonName(t, shown) })}</p>;
}

export function LookTab() {
  const app = useApp();
  const { t } = useT();
  const { data: view, error } = useQuery({ queryKey: ['settings'], queryFn: () => api.get<AdminSettingsView>('/api/settings') });
  // Only what has been changed here is held. Everything else is as the server has it.
  const [changed, setChanged] = useState<Partial<Typed>>({});
  // The melody being tried out, if one is, as the calm one or as the quick tune. It plays on this page only, and stops when the tab is left.
  const [heard, setHeard] = useState<MelodyTrial | null>(null);
  const { audition } = app;
  useEffect(() => {
    audition(heard);
    return () => audition(null);
  }, [audition, heard]);
  // Every timezone, and where its city is. A long list, fetched when the tab is first opened.
  const { data: zones } = useQuery({ queryKey: ['zone-places'], queryFn: async () => (await import('@/lib/zone-places')).ZONE_PLACES, staleTime: Infinity });
  if (!view) return <Loading error={error} />;

  const { words: _words, ...current } = view;
  const shown: Typed = { ...current, latitude: String(current.latitude ?? ''), longitude: String(current.longitude ?? ''), ...changed };
  const set = <Key extends keyof Typed>(key: Key, value: Typed[Key]) => setChanged((before) => ({ ...before, [key]: value }));
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
  const place = placeOf({ latitude: whole(latitude) ? latitude : null, longitude: whole(longitude) ? longitude : null });
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
    if (shown.moon === 'day' && !shown.moonDay) return app.toast(t('Choose the day whose moon the tree shows.'));
    const read: AdminSettings = { ...shown, latitude, longitude };
    if (!(await saveSettings(app, t, read, current))) return;
    setChanged({});
    // Whoever sets the family's look sees it at once, in place of what this browser had chosen for itself
    if (read.appearance !== current.appearance) app.followFamily(read.appearance, place);
  };

  return (
    <>
      <h3>{t('Light and dark')}</h3>
      <div className="fields">
        <Field label={t('The tree opens')} wide><Select options={inWords(t, APPEARANCE)} value={shown.appearance} onChange={(value) => set('appearance', value)} /></Field>
      </div>
      {shown.appearance === 'sun' && !place && <p className="warning">{t('By the sun needs the family’s place, below. Until it is given, the tree follows each person’s device.')}</p>}
      <p className="hint-line">{t('For everyone who has not chosen for themselves. Each person can still switch between light and dark from their own menu, and their browser remembers it. Saving a change here also switches this browser to it.')}</p>

      <h3>{t('The moon')}</h3>
      <div className="fields">
        <Field label={t('After dark')} wide><Select options={inWords(t, MOON)} value={shown.moon} onChange={(value) => set('moon', value)} /></Field>
        {shown.moon === 'day' && <Field label={t('The day')} wide><input type="date" value={shown.moonDay} onChange={(event) => set('moonDay', event.target.value)} /></Field>}
      </div>
      <MoonNow mode={shown.moon} day={shown.moonDay} place={place} />
      <p className="hint-line">{shown.moon === 'day'
        ? t('The moon exactly as it was that night, at ten in the evening where the family is: a wedding, a birth, the day they arrived.')
        : t('The moon shows in the dark, and steps aside while the years play.')}</p>

      <h3>{t('The garden')}</h3>
      <div className="fields">
        <Field label={t('Beside the tree')} wide><Select options={inWords(t, POND)} value={shown.pond} onChange={(value) => set('pond', value)} /></Field>
      </div>
      {shown.pond !== 'none' && <p className="hint-line">{t('Koi swim in the pond, and now and then one leaps.')}</p>}

      <h3>{t('Where the family is')}</h3>
      <p className="hint-line">{t('The sun and the moon on the tree stand where they really stand over this place: the moon turned the way it is seen from there, the sun warmer near sunrise and sunset. By the sun, it also decides when the tree turns dark.')}</p>
      <div className="fields">
        <Field label={t('Timezone')} wide><Select options={zoneOptions} value={shown.timezone} onChange={chooseZone} /></Field>
        <Field label={t('Latitude')}><input type="text" value={shown.latitude} onChange={(event) => set('latitude', event.target.value)} /></Field>
        <Field label={t('Longitude')}><input type="text" value={shown.longitude} onChange={(event) => set('longitude', event.target.value)} /></Field>
      </div>
      <div className="form-actions">
        <button type="button" onClick={fromHere}>{t('Use where I am now')}</button>
      </div>
      <ThereNow timezone={shown.timezone} place={place} />
      <p className="hint-line">{t('Choosing a timezone fills in its city. The place is kept to the nearest whole degree, about a hundred kilometres: enough for the sky, and not an address. North and east are plus, south and west are minus.')}</p>

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

      <div className="form-actions">
        <button type="button" className="primary" onClick={save}>{t('Save the look')}</button>
      </div>
    </>
  );
}
