import { sayFrom } from '@reactive-family-tree/core';
import type { Values } from '@reactive-family-tree/core';

/*
 * An error with an HTTP status and a message written for the person who
 * caused it, in English. It is said in their language on its way out. One
 * with values in it keeps the sentence with its gaps open, for that.
 */
export class HttpError extends Error {
  phrase: string | null = null;
  values: Values | null = null;

  constructor(
    readonly status: number,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }

  /* The same error, made from a sentence with gaps and the values to fill them. */
  static filled<E extends HttpError>(error: (message: string) => E, phrase: string, values: Values): E {
    const made = error(sayFrom(null, 'en', phrase, values));
    made.phrase = phrase;
    made.values = values;
    return made;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const signInFirst = (message = 'Sign in first.') => new HttpError(401, message);
export const forbidden = (message: string, details?: unknown) => new HttpError(403, message, details);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details);
export const invalid = (message: string, details?: unknown) => new HttpError(422, message, details);
export const tooMany = (message: string) => new HttpError(429, message);
