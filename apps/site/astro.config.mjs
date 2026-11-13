// @ts-check

/*
 * The project site. The home page and the demo are ordinary Astro pages with
 * the live tree as a React island. The docs are Starlight.
 * Author: George Khananaev
 */

import react from '@astrojs/react';
import starlight from '@astrojs/starlight';
import { defineConfig } from 'astro/config';

import { AUTHOR, FONTS, SITE_NAME } from './src/lib/site.mjs';

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
      customCss: ['./src/styles/docs.css'],
      // Commands are shown as plain code, without the drawn window around a terminal
      expressiveCode: { defaultProps: { frame: 'code' } },
      head: [
        { tag: 'meta', attrs: { name: 'author', content: AUTHOR } },
        // Starlight adds /favicon.svg itself. These two are for browsers without SVG icons, and phone home screens.
        { tag: 'link', attrs: { rel: 'icon', href: '/favicon.ico', sizes: '32x32' } },
        { tag: 'link', attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        { tag: 'link', attrs: { rel: 'stylesheet', href: FONTS } },
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
    ssr: { noExternal: WORKSPACE_SOURCE },
    resolve: { noExternal: WORKSPACE_SOURCE },
  },
});
