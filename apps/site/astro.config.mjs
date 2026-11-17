// @ts-check

/*
 * The project site. The home page and the demo are ordinary Astro pages with
 * the live tree as a React island. The docs are Starlight.
 * Author: George Khananaev
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

import { AUTHOR, FONTS, SITE_NAME, analyticsTags, iconLinks } from './src/lib/site.mjs';

/* A short hash of the icon files. It goes on the icon links, so a new icon shows at once. */
const iconHash = createHash('sha256');
for (const file of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png']) {
  iconHash.update(readFileSync(new URL(`./public/${file}`, import.meta.url)));
}
const ICON_VERSION = iconHash.digest('hex').slice(0, 8);
const icons = iconLinks(ICON_VERSION);

/*
 * The workspace packages are TypeScript source, so Vite compiles them with the
 * site and never hands them to Node as they are. `ssr` is Vite's classic server
 * setting. `resolve` is the one every environment reads, among them the one
 * Astro renders pages in.
 */
const WORKSPACE_SOURCE = ['reactive-family-tree', '@reactive-family-tree/core', '@reactive-family-tree/demo-data'];

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  integrations: [
    react(),
    starlight({
      title: SITE_NAME,
      description: 'How to run Reactive Family Tree for your own family, and how to build on it.',
      favicon: icons.svg.href,
      customCss: ['./src/styles/docs.css'],
      // Commands are shown as plain code, without the drawn window around a terminal
      expressiveCode: { defaultProps: { frame: 'code' } },
      head: [
        { tag: 'meta', attrs: { name: 'author', content: AUTHOR } },
        // Starlight adds the SVG icon itself, from `favicon` above
        { tag: 'link', attrs: icons.ico },
        { tag: 'link', attrs: icons.appleTouch },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: FONTS } },
        ...analyticsTags(process.env.PUBLIC_GA_ID),
      ],
      sidebar: [
        { label: 'Overview', slug: 'docs' },
        'docs/run-your-own',
        'docs/who-can-do-what',
        'docs/privacy',
        'docs/connect-your-ai',
        'docs/react-package',
        'docs/contributing',
        { label: 'Try the demo', link: '/demo/' },
      ],
    }),
  ],
  vite: {
    // The pages read it as import.meta.env.ICON_VERSION
    define: { 'import.meta.env.ICON_VERSION': JSON.stringify(ICON_VERSION) },
    ssr: { noExternal: WORKSPACE_SOURCE },
    resolve: { noExternal: WORKSPACE_SOURCE },
  },
});
