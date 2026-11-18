/*
 * What the whole site says about itself, kept in one place. The Astro config
 * reads it as well as the pages, which is why it is plain JavaScript.
 * Author: George Khananaev
 */

export const SITE_NAME = 'Reactive Family Tree';

export const AUTHOR = 'George Khananaev';

/* What the project is, in a few words. */
export const TAGLINE = 'a family tree drawn as a living tree';

/*
 * The icon links, as attributes for a <link>. `version` changes whenever an icon file does, so a
 * browser fetches the new icon instead of the copy it keeps for a long time.
 */
export function iconLinks(version) {
  return {
    ico: { rel: 'icon', href: `/favicon.ico?v=${version}`, sizes: '32x32' },
    svg: { rel: 'icon', href: `/favicon.svg?v=${version}`, type: 'image/svg+xml' },
    appleTouch: { rel: 'apple-touch-icon', href: `/apple-touch-icon.png?v=${version}` },
  };
}

/* The size of a shared-link picture, the one chat apps and social sites show large. */
export const CARD_SIZE = { width: 1200, height: 630 };

/**
 * Where a page's shared-link picture is: one per page, made at build time by src/pages/og/[...card].png.ts.
 * "/" has "/og/home.png", "/docs/privacy/" has "/og/docs/privacy.png".
 *
 * @param {string} pathname
 */
export function cardPath(pathname) {
  return `/og/${pathname.replace(/^\/+|\/+$/g, '') || 'home'}.png`;
}

/**
 * The head tags that name a page's picture, in Starlight's head form, so the docs and the site's own pages say the same.
 *
 * @param {string} pathname
 * @param {URL | undefined} site
 * @param {string} alt
 * @returns {{ tag: 'meta'; attrs: Record<string, string> }[]}
 */
export function cardTags(pathname, site, alt) {
  return [
    ['og:image', new URL(cardPath(pathname), site).href],
    ['og:image:type', 'image/png'],
    ['og:image:width', String(CARD_SIZE.width)],
    ['og:image:height', String(CARD_SIZE.height)],
    ['og:image:alt', alt],
  ].map(([property, content]) => ({ tag: 'meta', attrs: { property, content } }));
}

/**
 * Google Analytics, only when the site is built with a measurement ID (PUBLIC_GA_ID). The tags are in
 * Starlight's head form, so the docs and the site's own pages load the very same thing. Anything that
 * is not an ID of the form "G-…" is ignored, so nothing else can be written into the page this way.
 *
 * @param {string | undefined} id
 * @returns {{ tag: 'script'; attrs?: Record<string, string | boolean>; content?: string }[]}
 */
export function analyticsTags(id) {
  if (!id || !/^G-[A-Z0-9]+$/.test(id)) return [];
  return [
    { tag: 'script', attrs: { async: true, src: `https://www.googletagmanager.com/gtag/js?id=${id}` } },
    { tag: 'script', content: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');` },
  ];
}

/* The two typefaces of the approved design, loaded as docs/demo/web/index.html loads them. */
export const FONTS = 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400&family=Source+Sans+3:wght@400;500;600;700&display=swap';
