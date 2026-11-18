/*
 * The picture a chat app or a social site shows for a link to a page of the
 * site, made once per page at build time. The home page and the demo show the
 * real tree in full leaf; a docs page shows the app's icon. All of them sit on
 * the morning sky of the app icon, in the design's two typefaces.
 * Author: George Khananaev
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import satori from 'satori';
import sharp from 'sharp';

import { CARD_SIZE, SITE_NAME } from './site.mjs';

// A type rather than an interface, so Astro takes it as a page's props
export type CardText = {
  /* A few words above the title: what kind of page this is. */
  eyebrow: string;
  title: string;
  line: string;
  /* Show the tree in full leaf, as it is in the demo, instead of the icon. */
  tree: boolean;
};

const INK = '#14261F';
const MUTED = '#57606A';
const LEAF = '#2F6B4F';

// The build runs in apps/site, where these files are
const fromSite = (path: string) => readFile(join(process.cwd(), path));
const dataUri = (type: string, bytes: Buffer) => `data:${type};base64,${bytes.toString('base64')}`;

/* Everything a card is drawn from, read once for the whole build. */
const assets = (async () => {
  const [display, ui, uiBold, icon, still] = await Promise.all([
    fromSite('src/assets/card/literata-semibold.ttf'),
    fromSite('src/assets/card/sourcesans3-regular.ttf'),
    fromSite('src/assets/card/sourcesans3-semibold.ttf'),
    fromSite('public/favicon.svg'),
    // Kept small as WebP. The card is drawn from images it can read, so it is handed over as PNG.
    fromSite('src/assets/card/tree-still.webp').then((webp) => sharp(webp).png().toBuffer()),
  ]);
  return {
    fonts: [
      { name: 'display', data: display, weight: 600 as const, style: 'normal' as const },
      { name: 'ui', data: ui, weight: 400 as const, style: 'normal' as const },
      { name: 'ui', data: uiBold, weight: 600 as const, style: 'normal' as const },
    ],
    icon: dataUri('image/svg+xml', icon),
    still: dataUri('image/png', still),
  };
})();

/* How big a title is set, by how long it is and how much room it has, so it fits on three lines at most. */
const titleSize = (text: string, wide: boolean) => {
  const room = wide ? 1 : 0.8;
  return Math.round((text.length <= 14 ? 84 : text.length <= 26 ? 70 : text.length <= 40 ? 58 : 50) * room);
};

export async function cardPng({ eyebrow, title, line, tree }: CardText, site: URL): Promise<Buffer> {
  const { fonts, icon, still } = await assets;
  const size = titleSize(title, !tree);
  const svg = await satori(
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'ui', color: INK, backgroundImage: 'radial-gradient(circle at 74% 30%, rgba(255, 233, 160, 0.55) 0%, rgba(255, 233, 160, 0) 42%), linear-gradient(180deg, #EEF4F4 0%, #F6F8F1 100%)' }}>
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', padding: tree ? '40px 40px 0 72px' : '48px 72px 0', gap: tree ? 24 : 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: 18 }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: LEAF }}>{eyebrow}</div>
          <div style={{ fontFamily: 'display', fontSize: size, fontWeight: 600, lineHeight: 1.12, paddingBottom: Math.round(size * 0.12) }}>{title}</div>
          <div style={{ fontSize: 30, lineHeight: 1.35, color: MUTED, lineClamp: 3 }}>{line}</div>
        </div>
        {tree
          ? <img src={still} width={620} height={430} alt="" />
          : <img src={icon} width={420} height={420} alt="" />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 72px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <img src={icon} width={44} height={44} alt="" />
          <div style={{ fontFamily: 'display', fontSize: 28, fontWeight: 600 }}>{SITE_NAME}</div>
        </div>
        <div style={{ fontSize: 26, fontWeight: 600, color: MUTED }}>{site.host}</div>
      </div>
    </div>,
    { ...CARD_SIZE, fonts },
  );
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}
