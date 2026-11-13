import type { MetadataRoute } from 'next';

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

/* Only what a visitor may see: nobody masked ever appears here. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { config, store, views, members } = await getApp();
  await store.fresh();
  const tree = await views.tree(members.visitor());
  if (tree.closed) return [];
  return [
    { url: config.baseUrl, changeFrequency: 'weekly', priority: 1 },
    ...tree.people.flatMap((person) => (person.masked || person.pending ? [] : [{ url: `${config.baseUrl}/people/${person.id}`, changeFrequency: 'monthly' as const, priority: 0.6 }])),
  ];
}
