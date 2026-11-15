'use client';

/* Signing in and out from the browser: email links, passkeys and Google, through the sign-in library. */

import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { createAuthClient } from 'better-auth/client';

import { api } from './api';
import type { WebPhrase } from './i18n';

/* Says a sentence in the reader's language: pass `t` from useT(). Without it the words stay in English. */
type Say = (phrase: WebPhrase) => string;
const english: Say = (phrase) => phrase;

const client = createAuthClient({ plugins: [passkeyClient(), oauthProviderClient()] });

/*
 * The library answers with { data, error }, and words its errors in English, for a programmer. Here a failure is
 * thrown with the page's own sentence instead, which is in the reader's language.
 */
function settle<T>(result: { data: T | null; error: unknown }, otherwise: string): T | null {
  if (result.error) throw new Error(otherwise);
  return result.data;
}

/*
 * Ask for a sign-in link by email. The answer is the same whether or not the
 * address belongs to a relative. `backTo` is where the link lands once it has
 * signed the person in, and `proof` is what Cloudflare's check gave, where an
 * install has that check. A refusal comes worded for the person to read.
 */
export const sendLink = (email: string, backTo = '/', proof: string | null = null) =>
  api.post('/api/auth/sign-in/magic-link', { email, callbackURL: backTo, errorCallbackURL: '/?error=link' }, proof);

/*
 * A passkey prompt that is closed, or that the device turns down, fails in
 * technical words ("The operation either timed out or was not allowed"). These
 * two say what happened instead.
 */
export async function signInWithPasskey(say: Say = english): Promise<void> {
  const { error } = await client.signIn.passkey();
  if (error) throw new Error(say('No passkey was used. If you closed the prompt, try again, or ask for a link by email.'));
}

/* A passkey for the account that is signed in now, kept by this device or its password manager. */
export async function addPasskey(say: Say = english): Promise<void> {
  const { error } = await client.passkey.addPasskey();
  if (!error) return;
  throw new Error('code' in error && error.code === 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'
    ? say('This device already has a passkey for your account.')
    : say('No passkey was made. If you closed the prompt, try again when you are ready.'));
}

export async function signInWithGoogle(say: Say = english): Promise<void> {
  settle(await client.signIn.social({ provider: 'google', callbackURL: '/', errorCallbackURL: '/?error=google' }), say('Google sign-in could not be started.'));
}

export async function signOut(say: Say = english): Promise<void> {
  settle(await client.signOut(), say('Signing out did not work.'));
}

/* Three ways in that are particular to a family tree. Each ends in an ordinary session. */
export const family = {
  demoSignIn: (email: string) => api.post('/api/auth/family/demo-sign-in', { email }),
  acceptInvite: (input: { token: string; name: string; email: string }) => api.post('/api/auth/family/accept-invite', input),
  claimSetup: (input: { token: string; name: string; email: string }) => api.post('/api/auth/family/claim-setup', input),
};

/* An AI client is asking to act for the person signed in. Returns where to send the browser next. */
export async function answerConsent(accept: boolean, say: Say = english): Promise<string | null> {
  const answer = settle(await client.oauth2.consent({ accept }), say('That did not work. Start again from your AI client.')) as { uri?: string; url?: string; redirect_uri?: string } | null;
  return answer?.uri ?? answer?.url ?? answer?.redirect_uri ?? null;
}

/* The name an AI client gave itself when it asked to connect. */
export async function clientName(clientId: string): Promise<string | null> {
  const found = await client.oauth2.publicClient({ query: { client_id: clientId } });
  return (found.data as { client_name?: string; name?: string } | null)?.client_name ?? (found.data as { name?: string } | null)?.name ?? null;
}
