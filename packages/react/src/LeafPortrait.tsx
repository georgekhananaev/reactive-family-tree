/*
 * A leaf for the card's portrait, drawn exactly as on the tree.
 *
 * The same elements the engine writes for a leaf (see leafMarkup in engine.ts),
 * here as React elements. Its colours and its state come from tree.css, and its
 * gradients from the <defs> of the tree on the same page.
 * Author: George Khananaev
 */

import type { ReactElement } from 'react';
import { SHAPES, THIS_YEAR, goldOf, stateOf } from './leaf';
import type { LeafSubject } from './leaf';

export interface LeafPortraitProps {
  person: LeafSubject;
}

export function LeafPortrait({ person }: LeafPortraitProps): ReactElement {
  const shape = SHAPES.beech;
  return (
    <svg viewBox="-36 -72 72 76" aria-hidden="true">
      <g className={`leaf-node on state-${stateOf(person, THIS_YEAR)}`}>
        <circle className="glow cool" cx="0" cy="-36" r="46" fill="url(#leafGlow)" />
        <circle className="glow warm" cx="0" cy="-36" r="46" fill="url(#warmGlow)" />
        <circle className="you-ring" cx="0" cy="-36" r="40" />
        <circle className="tint-ring" cx="0" cy="-36" r="34" />
        <circle className="pulse" cx="0" cy="-36" r="30" />
        <path className="stem" d="M0,0 L0,-12" />
        <path className="hatch" d={shape.d} fill="url(#hatch)" />
        <path className={`blade g2 au${goldOf(person.id)}`} d={shape.d} />
        <path className="wash" d={shape.d} fill="url(#wash)" />
        <path className="vein" d={shape.v} />
      </g>
    </svg>
  );
}
