import type { MetadataRoute } from 'next';

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

/* Only what a visitor may see: nobody masked ever appears here. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { config, store, views, members } = await getApp();
  await store.fresh();
  const tree = await views.tree(members.visitor());
  if (tree.closed) return [];
  const front = { url: config.baseUrl, changeFrequency: 'weekly' as const, priority: 1 };
  // A demo is planted again from scratch now and then, and its people get new addresses each time
  if (config.demoMode) return [front];
  return [
    front,
    ...tree.people.flatMap((person) => (person.masked || person.pending ? [] : [{ url: `${config.baseUrl}/people/${person.id}`, changeFrequency: 'monthly' as const, priority: 0.6 }])),
  ];
}
