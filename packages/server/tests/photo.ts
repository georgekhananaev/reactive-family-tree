/* A made-up photo for the tests that need one. */

/* One segment of a JPEG file: a marker, its length, and what it holds. */
const segment = (marker: number, body: number[] | string): number[] => {
  const bytes = typeof body === 'string' ? [...Buffer.from(body, 'latin1')] : body;
  return [0xff, marker, (bytes.length + 2) >> 8, (bytes.length + 2) & 0xff, ...bytes];
};
const frame = (width: number, height: number) => segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);

/* A file laid out like a photo straight from a phone. Not a picture anyone could look at, but every part is where a real one has it. */
export function phonePhoto(width = 320, height = 320, seed = 1): Uint8Array<ArrayBuffer> {
  return new Uint8Array([
    0xff, 0xd8,
    ...segment(0xe0, 'JFIF\0\x01\x01\0\0\x01\0\x01\0\0'),
    ...segment(0xe1, 'Exif\0\0 taken at 51.4545 N, 2.5879 W on a phone'),
    ...segment(0xed, 'Photoshop 3.0\0 caption: the garden at number 12'),
    ...segment(0xfe, 'a comment left by the camera'),
    ...segment(0xe2, 'ICC_PROFILE\0 the colours'),
    ...segment(0xdb, [0, ...Array<number>(64).fill(16)]),
    ...frame(width, height),
    ...segment(0xc4, [0, ...Array<number>(16).fill(0)]),
    ...segment(0xda, [3, 1, 0, 2, 0x11, 3, 0x11, 0, 0x3f, 0]),
    0x12, 0x34, seed & 0xff, 0x56, 0xff, 0x00, 0x78,
    0xff, 0xd9,
  ]);
}
