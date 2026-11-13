/*
 * Whose tree this is and, under it, the caption: the chosen person's name and
 * years, or a line that says what to do while nobody is chosen.
 * Author: George Khananaev
 */

import type { ReactElement } from 'react';

import type { PersonLine } from '../lib/demo-family';

export interface TreeTitleProps {
  title: string;
  /* Shown while nobody is chosen. */
  hint: string;
  person: PersonLine | null;
}

export function TreeTitle({ title, hint, person }: TreeTitleProps): ReactElement {
  return (
    <div className="tree-title">
      <h1>{title}</h1>
      <p aria-live="polite">
        {person ? (
          <>
            <strong>{person.name}</strong>
            {person.years && `, ${person.years}`}
          </>
        ) : hint}
      </p>
    </div>
  );
}
