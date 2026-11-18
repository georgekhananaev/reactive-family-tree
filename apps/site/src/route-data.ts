/*
 * Each docs page names its own shared-link picture, as the site's other pages
 * do in Site.astro. Starlight already says the picture is to be shown large.
 * Author: George Khananaev
 */

import { defineRouteMiddleware } from '@astrojs/starlight/route-data';

import { cardTags } from './lib/site.mjs';

export const onRequest = defineRouteMiddleware((context) => {
  const { head, entry } = context.locals.starlightRoute;
  head.push(...cardTags(context.url.pathname, context.site, entry.data.title));
});
