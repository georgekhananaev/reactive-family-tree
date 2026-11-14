/*
 * Photos. One small JPEG per person, kept in a folder beside the database or
 * in an S3-compatible bucket such as Cloudflare R2. The same code either way.
 *
 * The browser crops and shrinks a photo before it sends it. The server still
 * checks what arrives: it must be a JPEG of a sane size, and everything a
 * camera writes into the file beside the picture (where it was taken, on what
 * phone) is cut out before the file is kept.
 */

import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { isMediaId } from '@reactive-family-tree/core';
import type { Actor } from '@reactive-family-tree/core';
import { media } from '@reactive-family-tree/db';
import type { Database } from '@reactive-family-tree/db';
import { and, eq, gt, lt, notInArray } from 'drizzle-orm';

import type { AppConfig } from './config';
import { HttpError, badRequest, tooMany } from './errors';
import { now } from './ids';
import type { FamilyStore } from './store';

const MAX_BYTES = 400 * 1024;
const MIN_SIDE = 64;
const MAX_SIDE = 1024;
const UPLOADS_PER_HOUR = 60;
/* An image nobody uses is kept this long, so that undoing a change of photo still finds the old one. */
const KEEP_UNUSED_DAYS = 30;

/* An image in memory, in a buffer of its own so it can be written to a file or sent as it is. */
export type Bytes = Uint8Array<ArrayBuffer>;

/* ---------- Checking and cleaning a JPEG ---------- */

/* Segments that carry notes about the picture and not the picture: EXIF and XMP, IPTC, comments. Colour profiles stay. */
const isNotes = (marker: number): boolean => marker === 0xe1 || (marker >= 0xe3 && marker <= 0xed) || marker === 0xef || marker === 0xfe;
/* Segments that open the picture and say how large it is. */
const isFrame = (marker: number): boolean => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

export interface CleanImage {
  bytes: Bytes;
  width: number;
  height: number;
}

/* A JPEG with its notes cut out, or an error that says what was wrong with it. */
export function cleanJpeg(bytes: Uint8Array): CleanImage {
  const wrong = () => badRequest('That is not a photo this tree can keep. Send a JPEG.');
  if (bytes.length > MAX_BYTES) throw badRequest('That photo is too large.');
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw wrong();

  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let width = 0, height = 0, at = 2;
  for (;;) {
    const marker = bytes[at + 1];
    if (bytes[at] !== 0xff || marker === undefined) throw wrong();
    // From here on it is the picture itself, to the end of the file
    if (marker === 0xda) {
      kept.push(bytes.subarray(at));
      break;
    }
    const length = ((bytes[at + 2] ?? 0) << 8) | (bytes[at + 3] ?? 0);
    const end = at + 2 + length;
    if (length < 2 || end > bytes.length) throw wrong();
    if (isFrame(marker)) {
      height = ((bytes[at + 5] ?? 0) << 8) | (bytes[at + 6] ?? 0);
      width = ((bytes[at + 7] ?? 0) << 8) | (bytes[at + 8] ?? 0);
    }
    if (!isNotes(marker)) kept.push(bytes.subarray(at, end));
    at = end;
  }
  if (Math.min(width, height) < MIN_SIDE || Math.max(width, height) > MAX_SIDE) throw HttpError.filled(badRequest, 'A photo must be between {min} and {max} pixels on each side.', { min: MIN_SIDE, max: MAX_SIDE });

  const clean = new Uint8Array(kept.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of kept) {
    clean.set(part, offset);
    offset += part.length;
  }
  return { bytes: clean, width, height };
}

/* ---------- Where the bytes are kept ---------- */

export interface MediaStore {
  put(id: string, bytes: Bytes): Promise<void>;
  get(id: string): Promise<Bytes | null>;
  remove(id: string): Promise<void>;
}

const fileName = (id: string): string => `${id}.jpg`;

function folderStore(folder: string): MediaStore {
  const path = (id: string) => join(folder, fileName(id));
  return {
    async put(id, bytes) {
      await mkdir(folder, { recursive: true });
      await writeFile(path(id), bytes);
    },
    async get(id) {
      try {
        return new Uint8Array(await readFile(path(id)));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    },
    remove: (id) => rm(path(id), { force: true }),
  };
}

export type S3Settings = NonNullable<AppConfig['media']['s3']>;

const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
const hmac = (key: string | Uint8Array, data: string): Uint8Array => createHmac('sha256', key).update(data).digest();

/*
 * The headers that sign one request to an S3-compatible store, by the scheme
 * they all share (AWS Signature Version 4). Every header given is signed.
 */
export function signS3(
  { method, url, headers = {}, body = new Uint8Array(), at = new Date() }: { method: string; url: URL; headers?: Record<string, string>; body?: Uint8Array; at?: Date },
  { accessKeyId, secretAccessKey, region }: Pick<S3Settings, 'accessKeyId' | 'secretAccessKey' | 'region'>,
): Record<string, string> {
  const stamp = at.toISOString().replace(/[-:]|\.\d{3}/g, '');   // 20130524T000000Z
  const day = stamp.slice(0, 8);
  const sent: Record<string, string> = { ...headers, host: url.host, 'x-amz-content-sha256': sha256(body), 'x-amz-date': stamp };
  const names = Object.keys(sent).map((name) => name.toLowerCase()).sort();
  const lowered = Object.fromEntries(Object.entries(sent).map(([name, value]) => [name.toLowerCase(), value.trim()]));
  const query = [...url.searchParams].map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).sort().join('&');
  const request = [method, url.pathname, query, ...names.map((name) => `${name}:${lowered[name]}`), '', names.join(';'), lowered['x-amz-content-sha256']].join('\n');
  const scope = `${day}/${region}/s3/aws4_request`;
  const key = [day, region, 's3', 'aws4_request'].reduce<string | Uint8Array>((secret, part) => hmac(secret, part), `AWS4${secretAccessKey}`);
  const signature = Buffer.from(hmac(key, ['AWS4-HMAC-SHA256', stamp, scope, sha256(request)].join('\n'))).toString('hex');
  const { host: _host, ...withoutHost } = sent;
  return { ...withoutHost, Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` };
}

function bucketStore(settings: S3Settings): MediaStore {
  const call = async (method: 'PUT' | 'GET' | 'DELETE', id: string, body?: Bytes): Promise<Response> => {
    const url = new URL(`${settings.endpoint}/${settings.bucket}/portraits/${fileName(id)}`);
    const headers = signS3({ method, url, body, headers: body ? { 'content-type': 'image/jpeg' } : {} }, settings);
    const response = await fetch(url, { method, headers, body });
    // A photo that is not there is an answer, not a failure
    if (!response.ok && !(method !== 'PUT' && response.status === 404)) {
      throw new Error(`The photo store refused a ${method} (${response.status}): ${(await response.text()).slice(0, 300)}`);
    }
    return response;
  };
  return {
    async put(id, bytes) {
      await call('PUT', id, bytes);
    },
    async get(id) {
      const response = await call('GET', id);
      return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
    },
    async remove(id) {
      await call('DELETE', id);
    },
  };
}

/* A bucket when one is set up, otherwise a folder beside the database. */
export function createMediaStore({ media: settings, databaseUrl }: Pick<AppConfig, 'media' | 'databaseUrl'>): MediaStore {
  if (settings.s3) return bucketStore(settings.s3);
  const beside = databaseUrl.startsWith('file:') ? dirname(databaseUrl.slice('file:'.length)) : './data';
  return folderStore(settings.dir ?? join(beside, 'media'));
}

/* ---------- Photos as the app uses them ---------- */

export class Media {
  constructor(
    private readonly db: Database,
    private readonly files: MediaStore,
    private readonly family: FamilyStore,
  ) {}

  /* Keep a photo that a signed-in relative sent, and give back its id. The same picture sent twice is kept once. */
  async save(actor: Actor, encoded: unknown): Promise<string> {
    if (typeof encoded !== 'string' || !encoded) throw badRequest('Send the photo.');
    const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
    const recent = await this.db.select({ id: media.id }).from(media).where(and(eq(media.uploadedBy, actor.userId ?? ''), gt(media.createdAt, hourAgo)));
    if (recent.length >= UPLOADS_PER_HOUR) throw tooMany('That is a lot of photos in one hour. Try again later.');

    const { bytes } = cleanJpeg(new Uint8Array(Buffer.from(encoded, 'base64')));
    const id = sha256(bytes).slice(0, 32);
    if (await this.has(id)) return id;
    await this.files.put(id, bytes);
    await this.db.insert(media).values({ id, size: bytes.length, uploadedBy: actor.userId, createdAt: now() }).onConflictDoNothing();
    return id;
  }

  async has(id: string): Promise<boolean> {
    if (!isMediaId(id)) return false;
    const [found] = await this.db.select({ id: media.id }).from(media).where(eq(media.id, id));
    return Boolean(found);
  }

  read(id: string): Promise<Bytes | null> {
    return isMediaId(id) ? this.files.get(id) : Promise.resolve(null);
  }

  private inUse(): string[] {
    return [...this.family.state.people.values()].flatMap((p) => (p.portrait ? [p.portrait] : []));
  }

  private async drop(ids: string[]): Promise<number> {
    for (const id of ids) {
      await this.files.remove(id);
      await this.db.delete(media).where(eq(media.id, id));
    }
    return ids.length;
  }

  /* A person was removed for good: their photo goes at once, unless someone else still uses the same picture. */
  async release(id: string | null): Promise<void> {
    if (id && !this.inUse().includes(id)) await this.drop([id]);
  }

  /* Run daily: photos that nobody has used for a while are removed. Returns how many went. */
  async sweep(): Promise<number> {
    const cutoff = new Date(Date.now() - KEEP_UNUSED_DAYS * 86400000).toISOString();
    const used = this.inUse();
    const old = await this.db.select({ id: media.id }).from(media).where(used.length ? and(lt(media.createdAt, cutoff), notInArray(media.id, used)) : lt(media.createdAt, cutoff));
    return this.drop(old.map((row) => row.id));
  }
}
