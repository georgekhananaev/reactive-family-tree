/*
 * What every request is asked before it is answered: how much it sends, and
 * which site sent it.
 */

import { HttpError } from './errors';

const tooLarge = () => new HttpError(413, 'That is too large to send.');

/*
 * The bytes a request sent, or null when it sent none. They are counted as
 * they arrive and dropped the moment they pass the limit, so that nobody can
 * fill the server's memory by sending something enormous.
 */
export async function readWithin(request: Request, limit: number): Promise<Buffer | null> {
  if (request.method === 'GET' || request.method === 'HEAD' || !request.body) return null;
  if (Number(request.headers.get('content-length')) > limit) throw tooLarge();
  const parts: Uint8Array[] = [];
  let size = 0;
  for await (const part of request.body as unknown as AsyncIterable<Uint8Array>) {
    size += part.byteLength;
    if (size > limit) throw tooLarge();
    parts.push(part);
  }
  return Buffer.concat(parts);
}

/* The same request with what it sent already read and measured, for a handler that would read all of it whatever its size. */
export async function measured(request: Request, limit: number): Promise<Request> {
  const sent = await readWithin(request, limit);
  if (sent === null) return request;
  return new Request(request.url, { method: request.method, headers: request.headers, body: new Uint8Array(sent), signal: request.signal });
}

/*
 * Whether a request came from a page of this site. A browser says which site
 * the page is on, and a page on another site must not be able to act with this
 * visitor's session. Whatever says nothing about it is not a page.
 *
 * This site is the address the request was sent to, or the address the tree is
 * known by, for a proxy that passes requests on under a name of its own.
 */
export function fromThisSite(request: Request, baseUrl: string): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const hosts = [request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host, new URL(baseUrl).host];
  // A page shut in a sandbox says "null", which is no address, and so not this site
  try {
    return hosts.includes(new URL(origin).host);
  } catch {
    return false;
  }
}
