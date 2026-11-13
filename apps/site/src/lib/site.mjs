/*
 * What the whole site says about itself, kept in one place. The Astro config
 * reads it as well as the pages, which is why it is plain JavaScript.
 * Author: George Khananaev
 */

export const SITE_NAME = 'Reactive Family Tree';

export const AUTHOR = 'George Khananaev';

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

/* The two typefaces of the approved design, loaded as docs/demo/web/index.html loads them. */
export const FONTS = 'https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400..700;1,7..72,400&family=Source+Sans+3:wght@400;500;600;700&display=swap';
