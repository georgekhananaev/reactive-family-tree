/*
 * Which build of Reactive Family Tree is running. The version comes from the
 * package itself. The commit and its day are told to the image as it is built
 * (see docker/Dockerfile), so a tree started straight from the source knows
 * its version and nothing more.
 */

import release from '../package.json';

import type { BuildInfo } from '@/components/About';

/* A commit, as git writes one out in full. */
const COMMIT = /^[0-9a-f]{40}$/;

export function buildInfo(): BuildInfo {
  const revision = process.env.BUILD_REVISION ?? '', made = new Date(process.env.BUILD_DATE ?? '');
  return { version: release.version, revision: COMMIT.test(revision) ? revision : null, made: Number.isNaN(made.getTime()) ? null : made.toISOString() };
}
