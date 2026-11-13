/* The web API. The routes and their rules live in the server package. This only passes requests in. */

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

async function handle(request: Request): Promise<Response> {
  const app = await getApp();
  return app.handle(request);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
