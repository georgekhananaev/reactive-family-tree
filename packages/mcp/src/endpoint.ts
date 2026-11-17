/*
 * The HTTP endpoint at /mcp, as one function from a request to a response.
 *
 * An AI client comes in either with a personal token from the "Connect your
 * AI" screen or with the access token it got by signing in as a member. Both
 * end up as the same thing: a member, and the connection it acts through.
 */

import { createMcpHandler } from '@modelcontextprotocol/server';
import { fromThisSite } from '@reactive-family-tree/server';
import type { App } from '@reactive-family-tree/server';

import { buildServer } from './server';
import type { Caller, RecentWrites } from './tools';

const json = (status: number, payload: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json', ...headers } });

export function createMcpEndpoint(app: App): (request: Request) => Promise<Response> {
  const recentWrites: RecentWrites = new Map();
  const handler = createMcpHandler(({ authInfo }) => buildServer(app, authInfo?.extra?.caller as Caller, recentWrites));

  return async function handle(request) {
    if (request.method !== 'POST') return json(405, { error: 'This endpoint answers POST requests only.' }, { Allow: 'POST' });

    // A browser page on another site must not be able to drive this endpoint
    if (!fromThisSite(request, app.config.baseUrl)) return json(403, { error: 'Requests from other sites are not accepted.' });

    const caller = await app.aiCaller(request);
    if (caller instanceof Response) return caller;
    return handler.fetch(request, { authInfo: { token: '', clientId: caller.connection.id, scopes: [], extra: { caller } } });
  };
}
