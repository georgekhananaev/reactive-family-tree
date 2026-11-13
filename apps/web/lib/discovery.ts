/*
 * The documents an AI client reads to learn how to sign in to this tree. The
 * sign-in library writes them. Clients look for them at the top of the site,
 * so the routes there hand the request over.
 */

import { getApp } from './server';

/* `servedAt` is where the sign-in library keeps the document. Without it the request is passed on as it came. */
export async function discovery(request: Request, servedAt?: string): Promise<Response> {
  const app = await getApp();
  if (!app.oauth) return new Response('Not found', { status: 404 });
  return app.auth.handler(servedAt ? new Request(`${app.config.baseUrl}${servedAt}`, { headers: request.headers }) : request);
}
