/*
 * The words for the kinds of things a person's card and page show: each kind
 * by its English sentence, said in the reader's language through `t`. Kept
 * apart from the components so the page drawn on the server can use them too.
 */

import { SEXES } from '@reactive-family-tree/core';
import type { FactType, Lang, Sex } from '@reactive-family-tree/core';

import type { WebPhrase } from '@/lib/i18n/phrases';

export const FACT_LABEL: Record<FactType, WebPhrase> = {
  birth: 'birth', death: 'death', burial: 'burial', residence: 'residence', occupation: 'occupation',
  education: 'education', immigration: 'immigration', military: 'military', religion: 'religion', custom: 'custom',
};

/* "Not known" for the sex, not "Unknown", which is what a leaf nobody has named is called */
const SEX_LABEL: Record<Sex, WebPhrase> = { female: 'Female', male: 'Male', other: 'Other', unknown: 'Not known' };

/* The choices of sex, in the reader's words. */
export const sexChoices = (t: (phrase: WebPhrase) => string) => SEXES.map((sex) => [sex, t(SEX_LABEL[sex])] as const);

/* Each language by its name, and as in "written in Hebrew". */
export const LANG_LABEL: Record<Lang, WebPhrase> = { en: 'English', he: 'Hebrew', ru: 'Russian' };
export const IN_LANG: Record<Lang, WebPhrase> = { en: 'in English', he: 'in Hebrew', ru: 'in Russian' };

/* A label that starts a line, with a capital where the language has them. */
export const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
