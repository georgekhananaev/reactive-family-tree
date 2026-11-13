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
  demoAccounts: [],
};

const bool = (value: unknown): value is boolean => typeof value === 'boolean';
const whole = (min: number, max: number) => (value: unknown) => Number.isInteger(value) && (value as number) >= min && (value as number) <= max;
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
};

/* What to tell someone whose typing a rule turned down. The other settings are picked from a list and cannot go wrong. */
export const SETTING_HINTS: Partial<Record<keyof AdminSettings, string>> = {
  familyName: 'Give the tree a name, up to 80 letters.',
  description: 'Keep the line about the family under 200 letters.',
  livingAge: 'Enter a whole number of years between 80 and 130.',
  aiWritesPerHour: 'Enter a whole number between 1 and 1000.',
  guidelines: 'Keep the guidelines under 4000 letters.',
};

export const ADMIN_SETTING_KEYS = Object.keys(SETTING_RULES) as (keyof AdminSettings)[];

/* What every browser is told, signed in or not. */
const PUBLIC_KEYS = ['familyName', 'description', 'visibility', 'visitorsCanSuggest', 'allowJoinRequests', 'allowAi', 'allowAiDirect', 'stewardsCanInvite'] as const satisfies readonly (keyof PublicSettings)[];

export function publicSettings(settings: Settings): PublicSettings {
  return Object.fromEntries(PUBLIC_KEYS.map((key) => [key, settings[key]])) as unknown as PublicSettings;
}

export function adminSettings(settings: Settings): AdminSettings {
  return Object.fromEntries(ADMIN_SETTING_KEYS.map((key) => [key, settings[key]])) as unknown as AdminSettings;
}
