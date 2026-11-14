/*
 * Every sentence the page can say, as it is written in English: the keys of
 * the Hebrew book. Adding a sentence to the page means adding it to a Hebrew
 * book part (and so to the Russian one, which must match it), or the page
 * does not compile.
 */

import type { he } from './he';

export type WebPhrase = keyof typeof he;
