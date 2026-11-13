/* An error with an HTTP status and a message written for the person who caused it. */
export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details);
export const signInFirst = (message = 'Sign in first.') => new HttpError(401, message);
export const forbidden = (message, details) => new HttpError(403, message, details);
export const notFound = (message = 'Not found.') => new HttpError(404, message);
export const conflict = (message, details) => new HttpError(409, message, details);
export const invalid = (message, details) => new HttpError(422, message, details);
export const tooMany = (message) => new HttpError(429, message);
