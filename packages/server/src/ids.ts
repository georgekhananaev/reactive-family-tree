/* Ids and tokens: random, unguessable, and stored only as a hash where they open a door. */

import { createHash, randomBytes } from 'node:crypto';

export const newId = (prefix: string) => `${prefix}_${randomBytes(9).toString('base64url')}`;
export const newToken = (prefix: string) => prefix + randomBytes(24).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const now = () => new Date().toISOString();
export const later = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
