/*
 * A stranger may ask three things of a family tree without an account: a
 * sign-in link, to join, and a correction. Where the family has Cloudflare's
 * Turnstile set up, the page sends its proof that a person is asking in this
 * header, with each of the three.
 */
export const PROOF_HEADER = 'x-human-check';
