import type { MetadataRoute } from 'next';

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

/*
 * Crawling is never blocked, even for a private tree: a crawler that is kept
 * out never sees the "noindex" a private tree sends, and may keep old
 * addresses listed.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const { config } = await getApp();
  return { rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/mcp', '/setup', '/sign-in', '/consent'] }, sitemap: `${config.baseUrl}/sitemap.xml` };
}
