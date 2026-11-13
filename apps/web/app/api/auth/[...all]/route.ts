/* Signing in and out, passkeys, and the OAuth server for AI clients: all answered by the sign-in library. */

import { getApp } from '@/lib/server';

async function handle(request: Request): Promise<Response> {
  const app = await getApp();
  return app.auth.handler(request);
}

export { handle as GET, handle as POST };
