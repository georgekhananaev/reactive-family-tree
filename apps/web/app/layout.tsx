import type { Metadata, Viewport } from 'next';
import { LANG_COOKIE, chooseLang, directionOf } from '@reactive-family-tree/core';
import { familyText } from '@reactive-family-tree/server';
import { Assistant, Frank_Ruhl_Libre, Literata, Source_Sans_3 } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import { appearanceScript, placeOf } from '@/lib/appearance';
import { previewImage } from '@/lib/card/meta';
import { bookFor } from '@/lib/i18n/books';
import { getT } from '@/lib/i18n/server';
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
// The same two in Cyrillic letters, and Hebrew ones drawn in the same spirit: a bookish serif and a plain sans. Each is fetched only
// when a page holds letters of its own script, so a reader of English downloads none of them.
const displayCyrillic = Literata({ subsets: ['cyrillic'], axes: ['opsz'], variable: '--font-display-cyrillic', display: 'swap', preload: false });
const uiCyrillic = Source_Sans_3({ subsets: ['cyrillic'], variable: '--font-ui-cyrillic', display: 'swap', preload: false });
const displayHebrew = Frank_Ruhl_Libre({ subsets: ['hebrew'], variable: '--font-display-hebrew', display: 'swap', preload: false });
const uiHebrew = Assistant({ subsets: ['hebrew'], variable: '--font-ui-hebrew', display: 'swap', preload: false });
const FONTS = [display, slanted, ui, displayCyrillic, uiCyrillic, displayHebrew, uiHebrew].map((font) => font.variable).join(' ');

export async function generateMetadata(): Promise<Metadata> {
  const [{ lang, t }, { store, config }] = await Promise.all([getT(), getApp()]);
  await store.fresh();
  return {
    // The address this install is reached at is only known while it runs, so every link in the page's head is made whole from it
    metadataBase: new URL(config.baseUrl),
    title: t('Family tree'),
    description: t('A family tree that grows.'),
    // A shared link to any page shows the tree's card, large. The tree's page and a person's set their own.
    openGraph: { images: [previewImage('/preview.png', store.seq, t('The {family} tree.', { family: familyText(store.settings, 'familyName', lang) }))] },
    twitter: { card: 'summary_large_image' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FFFFFF',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // How the family wants the tree to open is known only while the tree runs, so no page is made ahead of the request for it
  await connection();
  const app = await getApp(), { store, config } = app;
  await store.fresh();
  // The language is chosen as the server chooses it for every answer, so the page and what it fetches agree from the first moment
  const [asked, said] = await Promise.all([cookies(), headers()]);
  // By the sun, the page opens light or dark by where the sun is over the family. A stranger at a private tree is not told
  // where the family is, and day and night there, watched for a day, would tell it: they open as their own device is set.
  const told = store.settings.visibility !== 'private' || Boolean(await app.userOf(new Request(config.baseUrl, { headers: new Headers(said) })));
  const lang = chooseLang({ remembered: asked.get(LANG_COOKIE)?.value, device: said.get('accept-language') }, store.settings.language);
  const book = await bookFor(lang);
  return (
    <html lang={lang} dir={directionOf(lang)} className={FONTS} suppressHydrationWarning>
      <head>
        {/* Light or dark is chosen before anything is drawn */}
        <script dangerouslySetInnerHTML={{ __html: appearanceScript(store.settings.appearance, told ? placeOf(store.settings) : null) }} />
      </head>
      <body>
        <Providers lang={lang} book={book}>{children}</Providers>
      </body>
    </html>
  );
}
