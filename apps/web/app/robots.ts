import type { MetadataRoute } from 'next';

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

/*
 * Crawling is never blocked, even for a private tree: a crawler that is kept
 * out never sees the "noindex" a private tree sends, and may keep old
 * addresses listed.
 *
 * The page draws the tree from /api/session and /api/tree, and portraits come
 * from /api/people, so a search engine that renders the page may read those.
 * They answer a crawler only what they answer any visitor. The rest of the API
 * stays closed to crawlers.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { config } = await getApp();
  return {
    rules: { userAgent: '*', allow: ['/', '/api/session', '/api/tree', '/api/people/'], disallow: ['/api/', '/mcp', '/setup', '/sign-in', '/consent'] },
    sitemap: `${config.baseUrl}/sitemap.xml`,
  };
}
