/*
 * The backend, made once per server process. Everything a route needs comes
 * from here. It is kept on `globalThis` so that a development reload of this
 * module does not open the database twice or drop the live update streams.
 */

import { createApp, readConfig } from '@reactive-family-tree/server';
import type { App } from '@reactive-family-tree/server';

const holder = globalThis as typeof globalThis & { __familyTree?: Promise<App> };

export function getApp(): Promise<App> {
  holder.__familyTree ??= createApp(readConfig());
  return holder.__familyTree;
}
