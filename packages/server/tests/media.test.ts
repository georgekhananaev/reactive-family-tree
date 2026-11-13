/*
 * Photos, below the app: what counts as a picture this tree will keep, what is
 * cut out of it, and that requests to an S3-compatible store are signed the
 * way those stores check them.
 */

import { expect, test } from 'vitest';

import { cleanJpeg, signS3 } from '../src/media';

import { phonePhoto } from './photo';

test('a photo is kept without the notes a camera leaves in it', () => {
  const sent = phonePhoto();
  const { bytes, width, height } = cleanJpeg(sent);
  const kept = Buffer.from(bytes).toString('latin1');
  expect([width, height]).toEqual([320, 320]);
  expect(kept).not.toMatch(/51\.4545|number 12|comment left/);
  expect(kept, 'the picture and its colours stay').toContain('ICC_PROFILE');
  expect(bytes.length).toBeLessThan(sent.length);
  expect([bytes[0], bytes[1], bytes.at(-2), bytes.at(-1)]).toEqual([0xff, 0xd8, 0xff, 0xd9]);
  expect(cleanJpeg(bytes).bytes, 'cleaning twice changes nothing more').toEqual(bytes);
});

test('what is not a small photo is turned away', () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  expect(() => cleanJpeg(png)).toThrow(/Send a JPEG/);
  expect(() => cleanJpeg(phonePhoto().subarray(0, 40)), 'a file cut short').toThrow(/Send a JPEG/);
  expect(() => cleanJpeg(phonePhoto(4000, 3000)), 'a photo nobody shrank').toThrow(/between 64 and 1024/);
  expect(() => cleanJpeg(phonePhoto(16, 16))).toThrow(/between 64 and 1024/);
  expect(() => cleanJpeg(new Uint8Array(500 * 1024).fill(0xff))).toThrow(/too large/);
});

/* The worked examples from Amazon's own description of the signature, so any S3-compatible store accepts what is sent. */
test('requests to a bucket are signed the way S3 checks them', () => {
  const keys = { accessKeyId: 'AKIAIOSFODNN7EXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', region: 'us-east-1' };
  const at = new Date('2013-05-24T00:00:00Z');
  const scope = 'Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request';

  const read = signS3({ method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/test.txt'), headers: { range: 'bytes=0-9' }, at }, keys);
  expect(read.Authorization).toBe(`AWS4-HMAC-SHA256 ${scope}, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41`);
  expect(read['x-amz-date']).toBe('20130524T000000Z');
  expect(read.host, 'the browser or Node writes the host itself').toBeUndefined();

  const asked = signS3({ method: 'GET', url: new URL('https://examplebucket.s3.amazonaws.com/?lifecycle'), at }, keys);
  expect(asked.Authorization).toBe(`AWS4-HMAC-SHA256 ${scope}, SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=fea454ca298b7da1c68078a5d1bdbfbbe0d65c699e0f91ac7a200a0136783543`);

  const written = signS3({
    method: 'PUT', url: new URL('https://examplebucket.s3.amazonaws.com/test%24file.text'), at,
    headers: { date: 'Fri, 24 May 2013 00:00:00 GMT', 'x-amz-storage-class': 'REDUCED_REDUNDANCY' },
    body: new Uint8Array(Buffer.from('Welcome to Amazon S3.')),
  }, keys);
  expect(written.Authorization).toBe(`AWS4-HMAC-SHA256 ${scope}, SignedHeaders=date;host;x-amz-content-sha256;x-amz-date;x-amz-storage-class, Signature=98ad721746da40c64f1a55b78f14c238d841ea1380cd77a1b5971af0ece108bd`);
});
