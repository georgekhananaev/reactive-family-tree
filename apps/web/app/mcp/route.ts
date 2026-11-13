/* Where a relative's own AI client connects. The server itself lives in the MCP package. */

import { createMcpEndpoint } from '@reactive-family-tree/mcp';
import type { App } from '@reactive-family-tree/server';

import { getApp } from '@/lib/server';

export const dynamic = 'force-dynamic';

const endpoints = new WeakMap<App, (request: Request) => Promise<Response>>();

async function handle(request: Request): Promise<Response> {
  const app = await getApp();
  let endpoint = endpoints.get(app);
  if (!endpoint) {
    endpoint = createMcpEndpoint(app);
    endpoints.set(app, endpoint);
  }
  return endpoint(request);
}

export { handle as GET, handle as POST, handle as DELETE };
