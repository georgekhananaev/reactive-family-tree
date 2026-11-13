'use client';

import type { TreePerson } from '@reactive-family-tree/core';
import type { ReactNode } from 'react';
import { LeafPortrait } from 'reactive-family-tree';

/* Who the card is about: their leaf as on the tree, their name, and a line or two under it. */
export function CardHead({ person, name, bornAs, lines, children }: { person: TreePerson; name: string; bornAs?: string; lines: string[]; children?: ReactNode }) {
  return (
    <div className="head">
      <div className="medal"><LeafPortrait person={person} /></div>
      <div>
        <h2>{name}</h2>
        {bornAs && <p className="born-as">born {bornAs}</p>}
        {lines.map((line) => <p key={line} className="life">{line}</p>)}
        {children}
      </div>
    </div>
  );
}
