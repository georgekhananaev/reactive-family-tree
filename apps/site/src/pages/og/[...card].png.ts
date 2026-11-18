/*
 * One shared-link picture for every page of the site, written out as a plain
 * PNG at build time. The pages name theirs through cardPath().
 * Author: George Khananaev
 */

import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';

import { type CardText, cardPng } from '../../lib/card';
import { demoFamily } from '../../lib/demo-family';
import { SITE_NAME, TAGLINE } from '../../lib/site.mjs';

export const getStaticPaths = (async () => {
  const family = demoFamily();
  const docs = await getCollection('docs');
  const cards: { card: string; text: CardText }[] = [
    { card: 'home', text: { eyebrow: 'Open source and free to host', title: `${TAGLINE[0]?.toUpperCase()}${TAGLINE.slice(1)}`, line: 'Host it for your family, and let relatives look after their own branches.', tree: true } },
    { card: 'demo', text: { eyebrow: 'Live demo', title: `The ${family.name}`, line: `${family.tree.people.length} made-up people on the live tree, right in your browser.`, tree: true } },
    // The docs' own title and description. Their front page is called just "Docs", which says little on its own.
    ...docs.map(({ id, data }) => ({ card: id, text: { eyebrow: 'Docs', title: id === 'docs' ? `${SITE_NAME} docs` : data.title, line: data.description ?? '', tree: false } })),
  ];
  return cards.map(({ card, text }) => ({ params: { card }, props: text }));
}) satisfies GetStaticPaths;

export const GET: APIRoute<CardText> = async ({ props, site }) => {
  const png = await cardPng(props, site ?? new URL('http://localhost:4321'));
  return new Response(new Uint8Array(png), { headers: { 'Content-Type': 'image/png' } });
};
