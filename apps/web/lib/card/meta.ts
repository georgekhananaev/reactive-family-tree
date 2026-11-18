/*
 * How a page names its shared-link picture in its head. The address carries
 * the number of the tree's last change, so a chat app that keeps pictures by
 * address fetches a new one once the tree has changed.
 */

export const CARD_SIZE = { width: 1200, height: 630 };

export const previewImage = (path: string, seq: number, alt: string) => ({ url: `${path}?v=${seq}`, ...CARD_SIZE, alt, type: 'image/png' });
