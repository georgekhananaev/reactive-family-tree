/* What the admin can set from the UI, with the safe choices as defaults. */

import { isLang, readIn, wordsOf, writeIn } from '@reactive-family-tree/core';
import type { AdminSettings, AdminSettingsView, Lang, PublicSettings, Translations } from '@reactive-family-tree/core';
import type { Worded } from '@reactive-family-tree/core';

export interface DemoAccountSetting {
  email: string;
  blurb: string;
}

/* Everything kept as a setting: what the admin sets, and a few things the app sets for itself. */
export interface Settings extends AdminSettings {
  /* Whose family the tree opens on. */
  rootPersonId: string | null;
  /* Ready-made accounts planted with the demo family. Offered only when the install runs in demo mode. */
  demoAccounts: DemoAccountSetting[];
  /* The language the family's name, line and guidelines were first written in, and the same words in other languages. */
  familyLang: Lang;
  familyWords: Translations;
}

/* The family's own words, which are kept like a person's: in one language, with others beside it. */
export const FAMILY_FIELDS = ['familyName', 'description', 'guidelines'] as const;
type FamilyField = (typeof FAMILY_FIELDS)[number];
export const isFamilyField = (key: string): key is FamilyField => (FAMILY_FIELDS as readonly string[]).includes(key);

/* The family's words as one thing with a language, the way a person's are. */
export const familyThing = (settings: Settings): Worded & Record<FamilyField, string> => ({
  lang: settings.familyLang, tr: settings.familyWords, familyName: settings.familyName, description: settings.description, guidelines: settings.guidelines,
});

/* One of the family's words for a reader. */
export const familyText = (settings: Settings, field: FamilyField, lang: Lang): string => readIn(familyThing(settings), field, lang).text;

/*
 * The settings to save when an admin, reading the tree in `lang`, changes some
 * of the family's words. In the language they were first written in they are
 * simply changed. In another they are kept as that language's version.
 */
export function familyPatch(settings: Settings, set: Partial<Record<FamilyField, string>>, lang: Lang): Partial<Settings> {
  // Words nobody has written yet are first written now, in this language: a family set up in Hebrew is a Hebrew family
  const unwritten = settings.familyName === DEFAULT_SETTINGS.familyName && !settings.description && !settings.guidelines && !Object.keys(settings.familyWords).length;
  if (unwritten && lang !== settings.familyLang) return { ...set, familyLang: lang };
  const thing = familyThing(settings);
  writeIn(thing, FAMILY_FIELDS, set, lang);
  return lang === settings.familyLang ? set : { familyWords: thing.tr };
}

export const DEFAULT_SETTINGS: Settings = {
  familyName: 'Our family',
  description: '',
  rootPersonId: null,
  visibility: 'private',
  visitorsCanSuggest: false,
  allowJoinRequests: true,
  stewardsCanInvite: true,
  stewardsReview: true,
  livingAge: 110,
  guidelines: '',
  allowAi: true,
  allowAiDirect: true,
  aiWritesPerHour: 120,
  appearance: 'device',
  moon: 'tonight',
  moonDay: '',
  music: 'off',
  playMusic: true,
  melody: 'morning-mist',
  playMelody: 'morning-mist',
  timezone: '',
  latitude: null,
  longitude: null,
  language: 'en',
  demoAccounts: [],
  familyLang: 'en',
  familyWords: {},
};

const bool = (value: unknown): value is boolean => typeof value === 'boolean';
const whole = (min: number, max: number) => (value: unknown) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
// The server does not know the melodies, only what a melody's name looks like. A page that is told one it has never heard of plays its first.
const melodyName = (value: unknown) => typeof value === 'string' && /^[a-z][a-z-]{0,39}$/.test(value);
// A place is kept to the whole degree, about a hundred kilometres. That is all a sun and a moon need, and it is not an address.
const degrees = (most: number) => (value: unknown) => value === null || whole(-most, most)(value);
// Any name the world's clocks know. The list is long and grows, so the clock itself is asked.
const timezone = (value: unknown) => {
  if (typeof value !== 'string' || value.length > 64) return false;
  try {
    return value === '' || Boolean(new Intl.DateTimeFormat('en', { timeZone: value }));
  } catch {
    return false;
  }
};
/* A real day of the calendar, written as 1922-04-12, or nothing. */
const day = (value: unknown) => {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number) as [number, number, number], date = new Date(Date.UTC(y, m - 1, d));
  return y >= 1 && date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};
const text = (max: number, required = false) => (value: unknown) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);

/* What each setting the admin can change must look like. */
export const SETTING_RULES: Record<keyof AdminSettings, (value: unknown) => boolean> = {
  familyName: text(80, true),
  description: text(200),
  visibility: (value) => value === 'private' || value === 'public_masked' || value === 'public',
  visitorsCanSuggest: bool,
  allowJoinRequests: bool,
  stewardsCanInvite: bool,
  stewardsReview: bool,
  allowAi: bool,
  allowAiDirect: bool,
  livingAge: whole(80, 130),
  aiWritesPerHour: whole(1, 1000),
  guidelines: text(4000),
  appearance: (value) => value === 'device' || value === 'light' || value === 'dark' || value === 'sun',
  moon: (value) => value === 'tonight' || value === 'full' || value === 'day' || value === 'none',
  moonDay: day,
  music: (value) => value === 'none' || value === 'off' || value === 'on',
  playMusic: bool,
  melody: melodyName,
  playMelody: melodyName,
  timezone,
  latitude: degrees(90),
  longitude: degrees(180),
  language: isLang,
};

/* What to tell someone whose typing a rule turned down. The other settings are picked from a list and cannot go wrong. */
export const SETTING_HINTS: Partial<Record<keyof AdminSettings, string>> = {
  familyName: 'Give the tree a name, up to 80 letters.',
  description: 'Keep the line about the family under 200 letters.',
  livingAge: 'Enter a whole number of years between 80 and 130.',
  aiWritesPerHour: 'Enter a whole number between 1 and 1000.',
  guidelines: 'Keep the guidelines under 4000 letters.',
  timezone: 'Choose a timezone from the list.',
  latitude: 'Enter the latitude as a whole number between -90 and 90, or leave it empty.',
  longitude: 'Enter the longitude as a whole number between -180 and 180, or leave it empty.',
  moonDay: 'Choose a day from the calendar.',
};

export const ADMIN_SETTING_KEYS = Object.keys(SETTING_RULES) as (keyof AdminSettings)[];

/* What every browser is told, signed in or not. */
const PUBLIC_KEYS = ['familyName', 'description', 'language', 'visibility', 'visitorsCanSuggest', 'allowJoinRequests', 'allowAi', 'allowAiDirect', 'stewardsCanInvite', 'music', 'playMusic', 'melody', 'playMelody', 'latitude', 'longitude', 'appearance', 'moon', 'moonDay'] as const satisfies readonly (keyof PublicSettings)[];

/* What every browser is told, with the family's name and line in the reader's language. */
export function publicSettings(settings: Settings, relative: boolean, lang: Lang = settings.language): PublicSettings {
  const told = {
    ...Object.fromEntries(PUBLIC_KEYS.map((key) => [key, settings[key]])),
    familyName: familyText(settings, 'familyName', lang), description: familyText(settings, 'description', lang),
  } as unknown as PublicSettings;
  // Where the family is, and the day it chose for its moon, are not for a stranger at the door of a private tree
  return relative || settings.visibility !== 'private' ? told : { ...told, latitude: null, longitude: null, moonDay: '' };
}

/* The settings for an admin reading the tree in `lang`. */
export function adminSettings(settings: Settings, lang: Lang = settings.language): AdminSettingsView {
  const plain = Object.fromEntries(ADMIN_SETTING_KEYS.map((key) => [key, settings[key]])) as unknown as AdminSettings;
  const thing = familyThing(settings);
  return { ...plain, ...Object.fromEntries(FAMILY_FIELDS.map((field) => [field, readIn(thing, field, lang).text])), words: wordsOf(thing, FAMILY_FIELDS, lang) };
}
