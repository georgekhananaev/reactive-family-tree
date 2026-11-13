/*
 * The demo family, grown in memory with the rules the app runs on its server.
 *
 * The fictional Marlows come as operations, the only way a family changes.
 * They are applied to an empty family, and the result is opened as a tree to
 * draw. No server is involved, and loading the page again starts over.
 * Author: George Khananaev
 */

import { applyOps, emptyState, firstFact, formatDate, fullName, indexOf, openSnapshot } from '@reactive-family-tree/core';
import type { FamilyIndex, OpEnv, RuleSettings, TreeSnapshot } from '@reactive-family-tree/core';
import { DEMO_FAMILY, familyOps } from '@reactive-family-tree/demo-data';

/* What the caption says about one person. */
export interface PersonLine {
  name: string;
  /* "1924 to 2011", "born 1975", "born about 1955". Empty when no date is recorded. */
  years: string;
}

/* The first and last year the slider offers. */
export interface YearSpan {
  min: number;
  max: number;
}

export interface DemoFamily {
  name: string;
  description: string;
  tree: TreeSnapshot;
  /* Each person's caption, by their id on the tree. */
  lines: ReadonlyMap<string, PersonLine>;
  years: YearSpan;
}

/* The settings the app's own demo install is planted with. */
const SETTINGS: RuleSettings = { visibility: 'public_masked', visitorsCanSuggest: true, livingAge: 110 };

/* A life in words, as exactly as its dates are recorded and no more. */
function yearsOf(ix: FamilyIndex, personId: string): string {
  const born = formatDate(firstFact(ix, personId, 'birth')?.date);
  const died = formatDate(firstFact(ix, personId, 'death')?.date);
  if (born && died) return `${born} to ${died}`;
  if (born) return `born ${born}`;
  return died ? `died ${died}` : '';
}

export function demoFamily(): DemoFamily {
  const state = emptyState();
  // Ids counted up from one, so the tree takes the same shape on every load
  let made = 0;
  const env: OpEnv = { newId: (prefix) => `${prefix}_${++made}`, now: new Date().toISOString(), userId: null, userName: DEMO_FAMILY.familyName };
  const { created } = applyOps(state, familyOps(), env);

  const thisYear = new Date().getFullYear();
  const tree = openSnapshot(state, {
    family: { name: DEMO_FAMILY.familyName, description: DEMO_FAMILY.description, visibility: SETTINGS.visibility },
    rootId: created[DEMO_FAMILY.rootRef] ?? null,
    settings: SETTINGS,
    year: thisYear,
  });

  const ix = indexOf(state);
  const lines = new Map<string, PersonLine>();
  for (const person of state.people.values()) lines.set(person.id, { name: fullName(person), years: yearsOf(ix, person.id) });

  const births = tree.people.flatMap((person) => (!person.masked && person.born ? [person.born] : []));
  return {
    name: DEMO_FAMILY.familyName,
    description: DEMO_FAMILY.description,
    tree,
    lines,
    years: { min: births.length ? Math.min(...births) : thisYear, max: thisYear },
  };
}
