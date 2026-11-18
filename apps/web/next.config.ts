import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const config: NextConfig = {
  // One self-contained folder for the Docker image
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  // The pictures a shared link shows read their typefaces and the tree icon as files while the app runs
  outputFileTracingIncludes: { '**/preview.png': ['./assets/card/*.ttf', './app/icon.svg'] },
  // The workspace packages are TypeScript source, compiled here with the app
  transpilePackages: [
    'reactive-family-tree',
    '@reactive-family-tree/core',
    '@reactive-family-tree/db',
    '@reactive-family-tree/demo-data',
    '@reactive-family-tree/gedcom',
    '@reactive-family-tree/mcp',
    '@reactive-family-tree/server',
  ],
  // The database driver ships native code and is loaded as it is
  serverExternalPackages: ['@libsql/client', 'libsql'],
  experimental: {
    // The dev server starts from nothing each time. Its saved cache from earlier runs once left it
    // telling every page to restart, over and over. A cold start compiles this app in about a second.
    turbopackFileSystemCacheForDev: false,
  },
  // While developing, Next puts a badge in a corner of the page, and here every corner is taken: it sat on
  // the version and took its clicks. Errors are still shown without it.
  devIndicators: false,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          // Browsers heed this only over https. From then on they never try the tree over plain http again.
          { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
          // No other site may show the tree inside a page of its own, no plug-in is ever loaded, and a planted <base> cannot move the page's links
          { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" },
        ],
      },
    ];
  },
};

export default config;
