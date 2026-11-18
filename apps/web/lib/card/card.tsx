/*
 * The picture a chat app or a social site shows for a shared link: the tree's
 * own card and a person's. Both are drawn on the morning sky of the app icon,
 * in the app's two typefaces, with Hebrew ones for Hebrew words. They are made
 * on the server when a link is opened, from what a visitor may see.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';
import type { CSSProperties, ReactElement, ReactNode } from 'react';

import { CARD_SIZE } from './meta';
import { readsRtl, rtlWords } from './rtl';

const INK = '#14261F';
export const MUTED = '#57606A';
export const LEAF = '#2F6B4F';
const GOLD = '#C9992E';

const fromApp = (path: string) => readFile(join(process.cwd(), path));

/*
 * The typefaces, read once from the app's folder when a card is first drawn (next.config.ts copies them into the server
 * build). Each comes with a Hebrew one under the same name, and the picture takes a letter its first font lacks from the next.
 */
const FONT_FILES = [
  { name: 'display', file: 'literata-semibold.ttf', weight: 600 },
  { name: 'display', file: 'frankruhllibre-semibold.ttf', weight: 600 },
  { name: 'ui', file: 'sourcesans3-regular.ttf', weight: 400 },
  { name: 'ui', file: 'sourcesans3-semibold.ttf', weight: 600 },
  { name: 'ui', file: 'assistant-regular.ttf', weight: 400 },
  { name: 'ui', file: 'assistant-semibold.ttf', weight: 600 },
] as const;
let fonts: Promise<{ name: string; weight: 400 | 600; style: 'normal'; data: Buffer }[]> | undefined;
const loadFonts = () => (fonts ??= Promise.all(FONT_FILES.map(async ({ name, file, weight }) => ({ name, weight, style: 'normal' as const, data: await fromApp(`assets/card/${file}`) }))));

/* The app's own icon, as a picture to draw large. Read once, when a card is first drawn. */
let mark: Promise<string> | undefined;
export const treeMark = () => (mark ??= fromApp('app/icon.svg').then((svg) => `data:image/svg+xml;base64,${svg.toString('base64')}`));

/* The address the tree is reached at, as a reader would type it. */
const hostOf = (baseUrl: string) => new URL(baseUrl).host.replace(/^www\./, '');

interface LineProps {
  text: string;
  /* Which way the card reads: the page's language decides. */
  rtl: boolean;
  style: CSSProperties & { fontSize: number };
}

/*
 * One piece of text, lined up with the card's reading side. A right-to-left one is set word by word
 * from the right, since the picture cannot turn a line itself.
 */
export function Line({ text, rtl, style }: LineProps) {
  if (!readsRtl(text)) return <div style={{ display: 'flex', textAlign: rtl ? 'right' : 'left', ...style }}>{text}</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'row-reverse', flexWrap: 'wrap', justifyContent: rtl ? 'flex-start' : 'flex-end', columnGap: Math.round(style.fontSize * 0.26), ...style }}>
      {rtlWords(text).map((word, at) => <span key={at}>{word}</span>)}
    </div>
  );
}

interface CardProps {
  rtl: boolean;
  baseUrl: string;
  /* The words, on the reading side. */
  children: ReactNode;
  /* The picture on the other side: the tree, or a person's photo. */
  art: ReactNode;
}

/* The frame both cards share: the sky with the sun's glow, the words on one side, the picture on the other, the address at the foot. */
export function Card({ rtl, baseUrl, children, art }: CardProps) {
  const row = rtl ? 'row-reverse' : 'row';
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', fontFamily: 'ui', color: INK, backgroundImage: `radial-gradient(circle at ${rtl ? 24 : 76}% 34%, rgba(255, 233, 160, 0.62) 0%, rgba(255, 233, 160, 0) 42%), linear-gradient(180deg, #EEF4F4 0%, #F6F8F1 100%)` }}>
      <div style={{ display: 'flex', flex: 1, flexDirection: row, alignItems: 'center', padding: '48px 72px 0', gap: 48 }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: rtl ? 'flex-end' : 'flex-start', gap: 20 }}>{children}</div>
        <div style={{ display: 'flex', width: 440, height: 440, alignItems: 'center', justifyContent: 'center' }}>{art}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: row, justifyContent: 'space-between', alignItems: 'center', padding: '0 72px 44px' }}>
        <div style={{ display: 'flex', fontSize: 26, fontWeight: 600, color: MUTED }}>{hostOf(baseUrl)}</div>
        <div style={{ display: 'flex', width: 120, height: 6, borderRadius: 3, background: `linear-gradient(${rtl ? 270 : 90}deg, ${LEAF}, ${GOLD})` }} />
      </div>
    </div>
  );
}

/* How big a name is set, by how long it is, so a short one fills a line and a long one still fits on two. */
const titleSize = (text: string) => (text.length <= 12 ? 84 : text.length <= 20 ? 70 : text.length <= 34 ? 58 : 48);

/* A name in the display face, at most two lines of it. */
export function Title({ text, rtl }: { text: string; rtl: boolean }) {
  const size = titleSize(text), below = Math.round(size * 0.16);
  // Room under the last line for the tails of g and y, which the cut at two lines would clip
  return <Line text={text} rtl={rtl} style={{ fontFamily: 'display', fontSize: size, fontWeight: 600, lineHeight: 1.15, paddingBottom: below, maxHeight: Math.ceil(size * 2.3) + below, overflow: 'hidden' }} />;
}

/* The finished picture. It shows what the tree is now, so a site that fetches it again a little later gets a fresh one. */
export async function cardImage(card: ReactElement): Promise<ImageResponse> {
  return new ImageResponse(card, { ...CARD_SIZE, fonts: await loadFonts(), headers: { 'Cache-Control': 'public, max-age=600' } });
}
