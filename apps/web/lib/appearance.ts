/*
 * Light or dark. Someone's own choice is kept in their browser and comes
 * first. Without one the tree opens the way the family set it, and where the
 * family left that to each person, the way their device is set.
 */

import type { Appearance } from '@reactive-family-tree/core';

export type Theme = 'light' | 'dark';

/* Where a browser keeps the choice its own person made. */
export const OWN_CHOICE = 'rft-appearance';

/* What this device opens as when it follows the family. */
export const themeFor = (family: Appearance): Theme => (family === 'device' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : family);

/*
 * The few lines that run before anything is drawn, so the tree is never shown
 * one way and then the other. An address that ends in #theme=dark or
 * #theme=light comes before everything, for showing the tree off.
 */
export function appearanceScript(family: Appearance): string {
  // One of three words goes into the page, whatever the database held
  const told: Appearance = family === 'light' || family === 'dark' ? family : 'device';
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
