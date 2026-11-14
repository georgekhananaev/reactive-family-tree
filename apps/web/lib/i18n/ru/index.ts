/* Every sentence of the page in Russian, by the English one. It must hold every sentence the Hebrew book holds. */

import type { WebPhrase } from '../phrases';

import { card } from './card';
import { common } from './common';
import { entry } from './entry';
import { panels } from './panels';
import { tree } from './tree';

export const ru: Record<WebPhrase, string> = { ...common, ...tree, ...card, ...panels, ...entry };
