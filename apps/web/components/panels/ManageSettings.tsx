'use client';

/* Manage family, the settings: what the family is called, who can see it, who reviews, what an AI may do, the music, where the family is, and how the family writes things down. */

import type { AdminSettings, MusicMode, Visibility } from '@reactive-family-tree/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { MELODIES, QUICK_TUNES, skyOver } from 'reactive-family-tree';
import type { MelodyTrial, Place } from 'reactive-family-tree';

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
const namesOf = (list: typeof MELODIES) => list.map((one) => [one.id, one.name] as const);

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
function moonName(lit: number, waxing: boolean): string {
  if (lit < 0.02) return 'a new moon';
  if (lit > 0.98) return 'a full moon';
  return `${lit < 0.4 ? 'a crescent' : lit < 0.6 ? 'a half moon' : 'nearly full'}, ${waxing ? 'growing' : 'shrinking'}`;
}

/* The day and the time on the clocks of a timezone. Nothing for a timezone this browser has not heard of. */
function clockIn(timezone: string, now: Date): string | null {
  try {
    return timezone ? new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'long', hour: '2-digit', minute: '2-digit' }).format(now) : null;
  } catch {
    return null;
  }
}

/* What the sky is doing over the family's place right now, in a line of words: a way to see that the timezone and the place are the right ones. */
function ThereNow({ timezone, place }: { timezone: string; place: Place | null }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(clock);
  }, []);
  const { lit, waxing, sunHeight, moonHeight } = skyOver(now, place), time = clockIn(timezone, now);
  const moon = `${moonName(lit, waxing)} (${Math.round(lit * 100)}% lit)`;
  return (
    <p className="hint-line">
      {time && `It is ${time} there. `}
      {sunHeight === null || moonHeight === null
        ? `Tonight’s moon is ${moon}. Give a place, and the tree shows it the way it is seen from there.`
        : `The sun is ${sunHeight > 0 ? 'up' : 'down'}. The moon is ${moon}, and ${moonHeight > 0 ? 'up in the sky' : 'under the horizon'}.`}
    </p>
  );
}

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
  // Every timezone, and where its city is. A long list, fetched when the settings are first opened.
  const { data: zones } = useQuery({ queryKey: ['zone-places'], queryFn: async () => (await import('@/lib/zone-places')).ZONE_PLACES, staleTime: Infinity });
  if (!current) return <Loading error={error} />;

  const shown: Typed = {
    ...current, livingAge: String(current.livingAge), aiWritesPerHour: String(current.aiWritesPerHour),
    latitude: String(current.latitude ?? ''), longitude: String(current.longitude ?? ''), ...changed,
  };
  const set = <Key extends keyof Typed>(key: Key, value: Typed[Key]) => setChanged((before) => ({ ...before, [key]: value }));
  const text = (key: TextKey, inputMode?: 'numeric') => <input type="text" inputMode={inputMode} value={shown[key]} onChange={(event) => set(key, event.target.value)} />;
  const check = (key: CheckKey, label: string) => <Check label={label} checked={shown[key]} onChange={(on) => set(key, on)} />;
  /* One of the two choices, the calm melody or the quick tune that goes with one: the list, a line about the one chosen, and a button to hear it before it is saved. */
  const melody = (key: 'melody' | 'playMelody', label: string) => {
    const quick = key === 'playMelody', listening = heard?.quick === quick, list = quick ? QUICK_TUNES : MELODIES;
    return (
      <>
        <Field label={label} wide>
          <Select options={namesOf(list)} value={shown[key]} onChange={(value) => { set(key, value); if (listening) setHeard({ melody: value, quick }); }} />
        </Field>
        <p className="hint-line">{list.find((one) => one.id === shown[key])?.about}</p>
        <div className="form-actions">
          <button type="button" aria-pressed={listening} onClick={() => setHeard(listening ? null : { melody: shown[key], quick })}>{listening ? 'Stop' : quick ? 'Listen to the quick tune' : 'Listen'}</button>
        </div>
      </>
    );
  };

  /* The place as it would be saved: both numbers, or none. */
  const latitude = degrees(shown.latitude), longitude = degrees(shown.longitude);
  const place = whole(latitude) && whole(longitude) ? { latitude, longitude } : null;
  // The timezones the clocks know, and the one that is kept even if this list has not heard of it
  const zoneNames = [...new Set([...(zones?.keys() ?? []), ...(shown.timezone ? [shown.timezone] : [])])].sort();
  const zoneOptions: readonly (readonly [string, string])[] = [['', 'Not set'], ...zoneNames.map((name) => [name, name.replaceAll('_', ' ')] as const)];
  /* A timezone is also a first answer to where the family is: its city. */
  const chooseZone = (timezone: string) => {
    const city = zones?.get(timezone);
    setChanged((before) => ({ ...before, timezone, ...(city && { latitude: String(city.latitude), longitude: String(city.longitude) }) }));
  };
  /* The timezone of this device, and where it is if the browser will say. If it will not, the timezone's city stands. */
  const fromHere = () => {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    chooseZone(timezone);
    const refused = () => app.toast(zones?.has(timezone) ? 'The browser would not say where this is, so the place is the timezone’s city.' : 'The browser would not say where this is. Type the latitude and longitude instead.');
    if (!navigator.geolocation) return refused();
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      set('latitude', String(Math.round(coords.latitude)));
      set('longitude', String(Math.round(coords.longitude)));
    }, refused, { maximumAge: 3_600_000, timeout: 10_000 });
  };

  const save = async () => {
    if ([latitude, longitude].some(Number.isNaN)) return app.toast('Latitude and longitude are numbers, such as 32 and 35.');
    if ((latitude === null) !== (longitude === null)) return app.toast('Give both the latitude and the longitude, or neither.');
    const read: AdminSettings = { ...shown, livingAge: Number(shown.livingAge), aiWritesPerHour: Number(shown.aiWritesPerHour), latitude, longitude };
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
      {melody('playMelody', 'Which quick tune')}
      <h3>Where the family is</h3>
      <p className="hint-line">The sun and the moon on the tree are the real ones, as they stand over this place right now: the moon in tonight’s phase and turned the way it is seen from there, the sun warmer near sunrise and sunset.</p>
      <div className="fields">
        <Field label="Timezone" wide><Select options={zoneOptions} value={shown.timezone} onChange={chooseZone} /></Field>
        <Field label="Latitude">{text('latitude')}</Field>
        <Field label="Longitude">{text('longitude')}</Field>
      </div>
      <div className="form-actions">
        <button type="button" onClick={fromHere}>Use where I am now</button>
      </div>
      <ThereNow timezone={shown.timezone} place={place} />
      <p className="hint-line">Choosing a timezone fills in its city. The place is kept to the nearest whole degree, about a hundred kilometres: enough for the sky, and not an address. North and east are plus, south and west are minus.</p>
      <h3>Guidelines</h3>
      <p className="hint-line">How this family writes names and dates. Shown to people when they edit, and given to every connected AI.</p>
      <textarea rows={6} value={shown.guidelines} onChange={(event) => set('guidelines', event.target.value)} />
      <div className="form-actions">
        <button type="button" className="primary" onClick={save}>Save settings</button>
      </div>
    </>
  );
}
