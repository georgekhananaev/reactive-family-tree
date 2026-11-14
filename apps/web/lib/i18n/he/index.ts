/* Every sentence of the page in Hebrew, by the English one, in parts by where on the page they are. */

import { card } from './card';
import { common } from './common';
import { entry } from './entry';
import { panels } from './panels';
import { tree } from './tree';

export const he = { ...common, ...tree, ...card, ...panels, ...entry } as const;

/*
 * A sentence lives in one part only. Two parts holding the same one would
 * quietly override each other, so the page does not compile until one of
 * them gives it up: the error names the sentence.
 */
type Shared<A, B> = Extract<keyof A, keyof B>;
type Twice = Shared<typeof common, typeof tree> | Shared<typeof common, typeof card> | Shared<typeof common, typeof panels> | Shared<typeof common, typeof entry>
  | Shared<typeof tree, typeof card> | Shared<typeof tree, typeof panels> | Shared<typeof tree, typeof entry>
  | Shared<typeof card, typeof panels> | Shared<typeof card, typeof entry> | Shared<typeof panels, typeof entry>;
export const eachOnce: [Twice] extends [never] ? true : Twice = true;
