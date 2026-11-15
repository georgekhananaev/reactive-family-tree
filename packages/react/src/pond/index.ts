/*
 * The ponds that can lie on the ground beside the tree. Each is a drawing of
 * its own, laid over the ground in front of the tree's, so the koi swimming
 * in it never make the tree draw itself again.
 * Author: George Khananaev
 */

import { GARDEN_POND } from './garden';
import { KOI_POND } from './koi';
import type { Pond } from './parts';

export const PONDS = { garden: GARDEN_POND, koi: KOI_POND } as const satisfies Record<string, Pond>;

/* Which pond lies beside the tree: the garden pond with its bridge, its pine and its bamboo spout, the smaller koi pond, or none. */
export type PondChoice = keyof typeof PONDS | 'none';

export { startLeap } from './parts';
export type { Pond } from './parts';
