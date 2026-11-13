/*
 * Signing in. No passwords: an email link, a passkey, or Google.
 *
 * The sign-in library (Better Auth) keeps accounts and sessions in our own
 * database. It is also the OAuth server that lets a relative's AI client sign
 * in as that relative, which is how "connect your AI" works with nothing to
 * copy. Who an account is to the family (role, leaf, branches) is not decided
 * here: see members.ts.
 *
 * Nobody can make an account for themselves. Accounts come from an
 * invitation, from the first-run setup, or with the demo family.
 */

import { cimd } from '@better-auth/cimd';
import { fetchClientMetadataResource } from '@better-auth/cimd/node';
import { mcp, requireMcpAuth } from '@better-auth/mcp';
import { passkey } from '@better-auth/passkey';
import { schema } from '@reactive-family-tree/db';
import type { Database } from '@reactive-family-tree/db';
import { betterAuth } from 'better-auth';
import type { BetterAuthPlugin } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { verifyJwsAccessToken } from 'better-auth/oauth2';
import { jwt, magicLink } from 'better-auth/plugins';
import * as z from 'zod';

import type { AppConfig } from './config';
import type { Mailer } from './email';
import { HttpError } from './errors';

const SESSION_DAYS = 30;
const LINK_MINUTES = 15;

/* What the family's own rules decide during sign-in. Each returns the id of the account to sign in, or throws an HttpError. */
export interface FamilySignIn {
  familyName(): string;
  demoAccount(email: string): Promise<string>;
  acceptInvite(input: { token: string; name: string; email: string }): Promise<string>;
  claimSetup(input: { token: string; name: string; email: string }): Promise<string>;
}

const STATUS: Record<number, ConstructorParameters<typeof APIError>[0]> = {
  400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'UNPROCESSABLE_ENTITY',
};

/* Sign-in for a member's AI client needs HTTPS, or a loopback address while developing. */
export function oauthPossible(baseUrl: string): boolean {
  const { protocol, hostname } = new URL(baseUrl);
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/*
 * Three ways into an account that are particular to a family tree: accepting
 * an invitation, claiming a fresh install, and the demo's ready-made accounts.
 * Each is decided by the family's rules and ends in an ordinary session.
 */
function familyPlugin(family: FamilySignIn) {
  const signIn = <Body extends z.ZodType>(path: string, body: Body, resolve: (input: z.infer<Body>) => Promise<string>) =>
    createAuthEndpoint(path, { method: 'POST', body }, async (ctx) => {
      let userId: string;
      try {
        userId = await resolve(ctx.body as z.infer<Body>);
      } catch (error) {
        if (error instanceof HttpError) throw new APIError(STATUS[error.status] ?? 'BAD_REQUEST', { message: error.message });
        throw error;
      }
      const user = await ctx.context.internalAdapter.findUserById(userId);
      if (!user) throw new APIError('NOT_FOUND', { message: 'That account does not exist.' });
      const session = await ctx.context.internalAdapter.createSession(user.id);
      await setSessionCookie(ctx, { session, user });
      return ctx.json({ ok: true });
    });

  const person = { name: z.string().max(80), email: z.string().max(120) };
  return {
    id: 'family',
    endpoints: {
      familyDemoSignIn: signIn('/family/demo-sign-in', z.object({ email: z.string().max(120) }), ({ email }) => family.demoAccount(email)),
      familyAcceptInvite: signIn('/family/accept-invite', z.object({ token: z.string().max(200), ...person }), (input) => family.acceptInvite(input)),
      familyClaimSetup: signIn('/family/claim-setup', z.object({ token: z.string().max(200), ...person }), (input) => family.claimSetup(input)),
    },
  } satisfies BetterAuthPlugin;
}

export interface AuthOptions {
  db: Database;
  config: AppConfig;
  secret: string;
  mailer: Mailer;
  family: FamilySignIn;
  /* Called with every sign-in link as it is sent, so demo mode can show it on screen. */
  onLink?(email: string, url: string): void;
}

export function createAuth({ db, config, secret, mailer, family, onLink }: AuthOptions) {
  const { baseUrl, google } = config;
  const plugins: BetterAuthPlugin[] = [
    magicLink({
      // Only people who already have an account get a link
      disableSignUp: true,
      expiresIn: LINK_MINUTES * 60,
      sendMagicLink: async ({ email, url }) => {
        onLink?.(email, url);
        await mailer.send({
          to: email,
          subject: `Sign in to ${family.familyName()}`,
          text: `Open this link to sign in. It works once and for ${LINK_MINUTES} minutes.\n\n${url}\n\nIf you did not ask for it, ignore this message.`,
        });
      },
    }),
    passkey({ rpName: 'Reactive Family Tree' }),
    familyPlugin(family),
  ];
  if (oauthPossible(baseUrl)) {
    plugins.push(
      jwt(),
      mcp({
        loginPage: '/sign-in',
        consentPage: '/consent',
        resource: `${baseUrl}/mcp`,
        // An AI client may introduce itself. That alone opens nothing: a member still has to sign in and say yes.
        allowDynamicClientRegistration: true,
        allowUnauthenticatedClientRegistration: true,
        // Desktop clients call back to this computer and seldom say that they are desktop clients
        clientRegistrationDefaultApplicationType: 'infer',
      }),
      cimd({ fetchClientMetadataResource, metadataProfile: 'mcp-2026-07-28' }),
    );
  }

  return betterAuth({
    appName: 'Reactive Family Tree',
    baseURL: baseUrl,
    secret,
    database: drizzleAdapter(db, { provider: 'sqlite', schema }),
    session: { expiresIn: SESSION_DAYS * 86400, updateAge: 86400 },
    user: {
      additionalFields: {
        role: { type: 'string', defaultValue: 'member', input: false },
        personId: { type: 'string', required: false, input: false },
      },
    },
    // Google only signs in people who already have an account, matched by their verified address
    socialProviders: google ? { google: { ...google, disableSignUp: true } } : {},
    account: { accountLinking: { enabled: true, trustedProviders: ['google'] } },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;

/* What an access token says about the AI client that carries it. */
export interface AiClaims {
  /* The member it signed in as. */
  sub?: string;
  azp?: unknown;
  client_id?: unknown;
  /* Set when the token is tied to a key that the client holds. */
  cnf?: unknown;
}

/*
 * Check the access token of an AI client that signed in. Returns what the token
 * says, or the response that tells the client where and how to sign in.
 *
 * The keys that sign these tokens are this server's own, so they are read here
 * and never asked for over the network: from inside a container or behind a home
 * router, a server often cannot reach its own public address.
 */
export async function verifyAiSignIn(auth: Auth, resource: string, request: Request): Promise<AiClaims | Response> {
  let claims: AiClaims | null = null;
  // The library's own guard. It also writes the refusal that says where to sign in.
  const guard = requireMcpAuth(auth, (_request, verified) => {
    claims = verified;
    return new Response(null, { status: 204 });
  }, { resource });
  // Only the headers matter to it. The body is left for the MCP server to read.
  const ask = (headers?: Headers) => guard(new Request(request.url, { method: request.method, headers }));

  const token = /^Bearer\s+(\S+)$/i.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) {
    // No token at all, or one tied to a key of the client's, which the guard checks in full
    const response = await ask(request.headers);
    return claims ?? response;
  }
  const { baseURL } = await auth.$context;
  try {
    const verified: AiClaims = await verifyJwsAccessToken(token, {
      jwksFetch: async () => (await auth.handler(new Request(`${baseURL}/jwks`))).json(),
      jwksCacheKey: auth,
      verifyOptions: { issuer: baseURL, audience: resource, requiredClaims: ['azp'] },
    });
    // A token tied to a key must come with proof of that key, never as a plain bearer token
    if (!verified.cnf) return verified;
  } catch { /* not ours, changed, or run out: refused below */ }
  const refusal = await ask();
  const where = refusal.headers.get('www-authenticate');
  if (where) refusal.headers.set('www-authenticate', `${where}, error="invalid_token", error_description="The access token is not valid or has run out"`);
  return refusal;
}
