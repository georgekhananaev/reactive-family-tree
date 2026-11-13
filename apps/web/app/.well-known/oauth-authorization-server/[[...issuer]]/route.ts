/* Tells an AI client that wants to sign in where this tree's sign-in server is and what it supports. */

import { discovery } from '@/lib/discovery';

export const GET = (request: Request): Promise<Response> => discovery(request, '/api/auth/.well-known/oauth-authorization-server');
