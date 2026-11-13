/* The same directions as oauth-authorization-server, at the address OpenID Connect clients look for. */

import { discovery } from '@/lib/discovery';

export const GET = (request: Request): Promise<Response> => discovery(request, '/api/auth/.well-known/openid-configuration');
