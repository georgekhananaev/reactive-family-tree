'use client';

/* Every gesture and key in one place. Nothing in the app can only be done by a gesture, but they are quicker. */

import { Fragment } from 'react';

import type { PanelDef } from '../Drawer';

const SECTIONS: readonly (readonly [string, readonly (readonly [string, string])[]])[] = [
  ['Getting around', [
    ['Drag', 'Move the tree. Let go while moving and it keeps drifting'],
    ['Pinch, or scroll', 'Zoom'],
    ['Double tap or double click', 'Zoom in. With Shift, zoom out'],
    ['Double tap, hold, slide', 'Zoom with one hand'],
    ['Two-finger tap', 'Zoom out a step'],
    ['+  −  0', 'Zoom in, zoom out, show the whole tree'],
    ['M', 'Go to my leaf'],
  ]],
  ['People', [
    ['Tap a leaf', 'Open that person'],
    ['Hold a leaf, or right click', 'A ring of actions. Keep the finger down, slide to one, let go'],
    ['Arrow keys', 'Travel along the family: up to a child, down to a parent, sideways to partners and siblings'],
    ['Enter', 'Open the person. Space folds or shows their branch'],
    ['.', 'Open the ring of actions from the keyboard'],
    ['F', 'Show the family of the person who is open'],
    ['/', 'Search'],
  ]],
  ['Editing', [
    ['E', 'Turn edit mode on or off'],
    ['Pull a + bud', 'Add a child, partner, parent or sibling'],
    ['Enter in a form', 'Save'],
    ['Ctrl or Cmd + Z', 'Take back your last change'],
  ]],
  ['Time', [
    ['P', 'Play the family growing, or pause'],
    ['[  ]', 'One year back, one year on'],
  ]],
  ['Everywhere', [
    ['Esc', 'Close whatever is on top'],
    ['?', 'This list'],
  ]],
];

function HelpBody() {
  return SECTIONS.map(([title, rows]) => (
    <Fragment key={title}>
      <h3>{title}</h3>
      <dl className="keys">
        {rows.map(([keys, what]) => (
          <Fragment key={keys}>
            <dt>{keys}</dt>
            <dd>{what}</dd>
          </Fragment>
        ))}
      </dl>
    </Fragment>
  ));
}

export const help: PanelDef = { title: () => 'Gestures and keys', Body: HelpBody };
