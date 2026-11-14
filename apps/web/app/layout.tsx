import type { Metadata, Viewport } from 'next';
import { Literata, Source_Sans_3 } from 'next/font/google';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { appearanceScript } from '@/lib/appearance';
import { getApp } from '@/lib/server';

import 'reactive-family-tree/tree.css';
import './app.css';
import './pages.css';
import { Providers } from './providers';

// Literata was drawn for reading on screens at small sizes. Source Sans is plain and clear for controls.
const display = Literata({ subsets: ['latin'], axes: ['opsz'], variable: '--font-display', display: 'swap' });
// Its slanted cut is met only in a note or a suggestion, deep inside a card. It is fetched when one first shows, and not ahead of every page.
const slanted = Literata({ subsets: ['latin'], style: 'italic', axes: ['opsz'], variable: '--font-display-slanted', display: 'swap', preload: false });
const ui = Source_Sans_3({ subsets: ['latin'], variable: '--font-ui', display: 'swap' });

export const metadata: Metadata = {
  title: 'Family tree',
  description: 'A family tree that grows.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // How the family wants the tree to open is known only while the tree runs, so no page is made ahead of the request for it
  await connection();
  const { store } = await getApp();
  await store.fresh();
  return (
    <html lang="en" className={`${display.variable} ${slanted.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        {/* Light or dark is chosen before anything is drawn */}
        <script dangerouslySetInnerHTML={{ __html: appearanceScript(store.settings.appearance) }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
