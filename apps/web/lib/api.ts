/* Talking to the server from the browser. A failed request throws an error whose message is written for the person to read. */

import { PROOF_HEADER } from '@reactive-family-tree/core';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

/* When this browser last changed something, so a change it sees soon after is known to be its own. */
export const activity = { lastWrite: 0 };

/*
 * The language the page is read in. Every request asks for it, so the server answers in the same language.
 * `words` says the few sentences of this file in it: the server says its own errors in the page's language already.
 */
let speaking: string | null = null;
let words = (english: 'The server cannot be reached. Check that it is still running.' | 'Something went wrong.') => english as string;
export const speakTo = (lang: string, say: typeof words) => { speaking = lang; words = say; };

/* `proof` is what Cloudflare's check gave, sent with the few things a stranger may ask where an install has that check. */
async function call<T>(method: string, path: string, body?: unknown, lang: string | null = speaking, proof: string | null = null): Promise<T> {
  if (method !== 'GET') activity.lastWrite = Date.now();
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(lang ? { 'X-Language': lang } : {}), ...(proof ? { [PROOF_HEADER]: proof } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, words('The server cannot be reached. Check that it is still running.'));
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string; message?: string; details?: unknown };
  if (!response.ok) throw new ApiError(response.status, data.error ?? data.message ?? words('Something went wrong.'), data.details);
  return data as T;
}

export const api = {
  get: <T>(path: string) => call<T>('GET', path),
  post: <T>(path: string, body: unknown = {}, proof: string | null = null) => call<T>('POST', path, body, speaking, proof),
  patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body),
  del: <T>(path: string) => call<T>('DELETE', path),
  /* The same, for one request made as if the page were read in another language: to write the family's own words in that language. */
  as: (lang: string) => ({
    get: <T>(path: string) => call<T>('GET', path, undefined, lang),
    patch: <T>(path: string, body: unknown) => call<T>('PATCH', path, body, lang),
  }),
};

export const messageOf = (error: unknown) => (error instanceof Error ? error.message : words('Something went wrong.'));
