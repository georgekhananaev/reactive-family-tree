'use client';

/* Every gesture and key in one place. Nothing in the app can only be done by a gesture, but they are quicker. */

import { Fragment } from 'react';

import { useT } from '@/lib/i18n';
import type { WebPhrase } from '@/lib/i18n';

import type { PanelDef } from '../Drawer';

/* A key as it is printed on the keyboard, the same in every language. A gesture is said in words. */
interface Printed {
  printed: string;
}
const key = (printed: string): Printed => ({ printed });

const SECTIONS: readonly (readonly [WebPhrase, readonly (readonly [WebPhrase | Printed, WebPhrase])[]])[] = [
  ['Getting around', [
    ['Drag', 'Move the tree. Let go while moving and it keeps drifting'],
    ['Pinch, or scroll', 'Zoom'],
    ['Double tap or double click', 'Zoom in. With Shift, zoom out'],
    ['Double tap, hold, slide', 'Zoom with one hand'],
    ['Two-finger tap', 'Zoom out a step'],
    [key('+  −  0'), 'Zoom in, zoom out, show the whole tree'],
    [key('M'), 'Go to my leaf'],
    [key('V'), 'Switch between leaves and faces, once someone has a photo'],
  ]],
  ['People', [
    ['Tap a leaf', 'Open that person'],
    ['Hold a leaf, or right click', 'A ring of actions. Keep the finger down, slide to one, let go'],
    ['Arrow keys', 'Travel along the family: up to a child, down to a parent, sideways to partners and siblings'],
    [key('Enter'), 'Open the person. Space folds or shows their branch'],
    [key('.'), 'Open the ring of actions from the keyboard'],
    [key('F'), 'Show the family of the person who is open'],
    [key('/'), 'Search'],
  ]],
  ['Editing', [
    [key('E'), 'Turn edit mode on or off'],
    ['Pull a + bud', 'Add a child, partner, parent or sibling'],
    ['Enter in a form', 'Save'],
    ['Ctrl or Cmd + Z', 'Take back your last change'],
  ]],
  ['Time', [
    [key('P'), 'Play the family growing, or pause'],
    [key('S'), 'Turn the melody in the background on or off, where the family has one'],
    [key('[  ]'), 'One year back, one year on'],
  ]],
  ['Everywhere', [
    [key('Esc'), 'Close whatever is on top'],
    [key('?'), 'This list'],
  ]],
];

function HelpBody() {
  const { t } = useT();
  return SECTIONS.map(([title, rows]) => (
    <Fragment key={title}>
      <h3>{t(title)}</h3>
      <dl className="keys">
        {rows.map(([keys, what]) => (
          <Fragment key={what}>
            <dt>{typeof keys === 'string' ? t(keys) : keys.printed}</dt>
            <dd>{t(what)}</dd>
          </Fragment>
        ))}
      </dl>
    </Fragment>
  ));
}

export const help: PanelDef = { title: (_args, _app, t) => t('Gestures and keys'), Body: HelpBody };
