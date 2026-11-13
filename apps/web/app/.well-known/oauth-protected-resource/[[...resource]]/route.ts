/*
 * Tells an AI client that was turned away from /mcp which sign-in server
 * guards it. The sign-in library answers this very address, so the request is
 * passed to it as it came.
 */

import { discovery } from '@/lib/discovery';

export const GET = (request: Request): Promise<Response> => discovery(request);
