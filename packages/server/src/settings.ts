/* What the admin can set from the UI, with the safe choices as defaults. */

import type { AdminSettings, PublicSettings } from '@reactive-family-tree/core';

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
  music: 'off',
  playMusic: true,
  melody: 'morning-mist',
  playMelody: 'morning-mist',
  timezone: '',
  latitude: null,
  longitude: null,
  demoAccounts: [],
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
  appearance: (value) => value === 'device' || value === 'light' || value === 'dark',
  music: (value) => value === 'none' || value === 'off' || value === 'on',
  playMusic: bool,
  melody: melodyName,
  playMelody: melodyName,
  timezone,
  latitude: degrees(90),
  longitude: degrees(180),
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
};

export const ADMIN_SETTING_KEYS = Object.keys(SETTING_RULES) as (keyof AdminSettings)[];

/* What every browser is told, signed in or not. */
const PUBLIC_KEYS = ['familyName', 'description', 'visibility', 'visitorsCanSuggest', 'allowJoinRequests', 'allowAi', 'allowAiDirect', 'stewardsCanInvite', 'music', 'playMusic', 'melody', 'playMelody', 'latitude', 'longitude'] as const satisfies readonly (keyof PublicSettings)[];

export function publicSettings(settings: Settings, relative: boolean): PublicSettings {
  const told = Object.fromEntries(PUBLIC_KEYS.map((key) => [key, settings[key]])) as unknown as PublicSettings;
  // Where the family is, is not for a stranger at the door of a private tree
  return relative || settings.visibility !== 'private' ? told : { ...told, latitude: null, longitude: null };
}

export function adminSettings(settings: Settings): AdminSettings {
  return Object.fromEntries(ADMIN_SETTING_KEYS.map((key) => [key, settings[key]])) as unknown as AdminSettings;
}
