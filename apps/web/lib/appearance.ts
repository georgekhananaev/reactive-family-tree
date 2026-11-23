/*
 * Light or dark. Someone's own choice is kept in their browser and comes
 * first. Without one the tree opens the way the family set it: light, dark,
 * by the sun where the family is, or, where the family left it to each
 * person, the way their device is set.
 */

import type { Appearance, SpacingMode } from '@reactive-family-tree/core';
import { skyOver } from 'reactive-family-tree/sky';
import type { Place } from 'reactive-family-tree/sky';

export type Theme = 'light' | 'dark';

/* The family's five choices of how roomy the tree is, from the tightest to the roomiest, and how many times roomier than it comes each draws it. */
export const SPACING_OF: Readonly<Record<SpacingMode, number>> = { tight: 0.7, compact: 0.85, normal: 1, roomy: 1.25, wide: 1.5 };

/* Where a browser keeps the choice its own person made. */
export const OWN_CHOICE = 'rft-appearance';

/* Where the family is, from its settings, if both halves are known. */
export const placeOf = ({ latitude, longitude }: { latitude: number | null; longitude: number | null }): Place | null =>
  (latitude === null || longitude === null ? null : { latitude, longitude });

/* Light while the sun is up where the family is, dark once it has set. Null where the place is not known. */
export const bySun = (place: Place | null, now = new Date()): Theme | null => {
  const height = place ? skyOver(now, place).sunHeight : null;
  return height === null ? null : height > 0 ? 'light' : 'dark';
};

/* What this device opens as when it follows the family. By the sun, without a place to say where the sun is, it is the device's way. */
export const themeFor = (family: Appearance, place: Place | null): Theme => {
  const settled = family === 'sun' ? bySun(place) : family === 'device' ? null : family;
  return settled ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
};

/*
 * The few lines that run before anything is drawn, so the tree is never shown
 * one way and then the other. An address that ends in #theme=dark or
 * #theme=light comes before everything, for showing the tree off.
 */
export function appearanceScript(family: Appearance, place: Place | null): string {
  // By the sun is settled here, from where the sun is now over the family's place. One of three words goes into the page, whatever the database held.
  const settled = family === 'sun' ? bySun(place) : family;
  const told: Appearance = settled === 'light' || settled === 'dark' ? settled : 'device';
  return `(function () {
  var own = null;
  try { own = localStorage.getItem('${OWN_CHOICE}'); } catch (e) {}
  var fromAddress = /(?:^|[#&])theme=(light|dark)/.exec(location.hash);
  var family = '${told}';
  var device = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  var theme = fromAddress ? fromAddress[1] : own === 'light' || own === 'dark' ? own : family === 'device' ? device : family;
  document.documentElement.setAttribute('data-theme', theme);
})();`;
}
