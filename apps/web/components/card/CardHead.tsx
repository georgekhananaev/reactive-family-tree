'use client';

import type { TreePerson } from '@reactive-family-tree/core';
import type { ReactNode } from 'react';
import { LeafPortrait } from 'reactive-family-tree';

import { Photo } from '@/components/Photo';
import { portraitUrl } from '@/lib/format';

/* Who the card is about: their photo, which opens large when pressed, or their leaf as on the tree, then their name and a line or two under it. */
export function CardHead({ person, name, bornAs, lines, children }: { person: TreePerson; name: string; bornAs?: string; lines: string[]; children?: ReactNode }) {
  const photo = person.masked ? null : portraitUrl(person);
  return (
    <div className="head">
      <div className="medal">{photo ? <Photo src={photo} name={name} /> : <LeafPortrait person={person} />}</div>
      <div>
        <h2>{name}</h2>
        {bornAs && <p className="born-as">born {bornAs}</p>}
        {lines.map((line) => <p key={line} className="life">{line}</p>)}
        {children}
      </div>
    </div>
  );
}
