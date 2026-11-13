/* An error with an HTTP status and a message written for the person who caused it. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, message, details);
export const signInFirst = (message = 'Sign in first.') => new HttpError(401, message);
export const forbidden = (message: string, details?: unknown) => new HttpError(403, message, details);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message: string, details?: unknown) => new HttpError(409, message, details);
export const invalid = (message: string, details?: unknown) => new HttpError(422, message, details);
export const tooMany = (message: string) => new HttpError(429, message);
