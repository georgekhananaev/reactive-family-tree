/*
 * The picture shown for a shared link to the tree, and to any page under it
 * that has none of its own.
 */

import { cardImage } from '@/lib/card/card';
import { familyCard } from '@/lib/card/family';

export const dynamic = 'force-dynamic';

export async function GET() {
  return cardImage(await familyCard());
}
