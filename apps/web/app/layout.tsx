import type { Metadata, Viewport } from 'next';
import { Literata, Source_Sans_3 } from 'next/font/google';
import type { ReactNode } from 'react';

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

/* Choose light or dark before anything is drawn: a saved choice first, otherwise the device setting. */
const APPEARANCE = `(function () {
  var saved = null;
  try { saved = localStorage.getItem('rft-appearance'); } catch (e) {}
  var fromAddress = /(?:^|[#&])theme=(light|dark)/.exec(location.hash);
  var theme = fromAddress ? fromAddress[1] : saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${slanted.variable} ${ui.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPEARANCE }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
