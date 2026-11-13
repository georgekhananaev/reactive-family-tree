import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

const config: NextConfig = {
  // One self-contained folder for the Docker image
  output: 'standalone',
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
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
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
        ],
      },
    ];
  },
};

export default config;
