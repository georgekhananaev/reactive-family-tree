/*
 * Turn the SQL files drizzle-kit wrote into one module, so migrations travel
 * inside the code and need no files at run time.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const folder = fileURLToPath(new URL('../drizzle/', import.meta.url));
const target = fileURLToPath(new URL('../src/migrations.generated.ts', import.meta.url));

const migrations = readdirSync(folder)
  .filter((file) => file.endsWith('.sql'))
  .sort()
  .map((file) => ({
    name: file.replace(/\.sql$/, ''),
    statements: readFileSync(folder + file, 'utf8')
      .split('--> statement-breakpoint')
      .map((statement) => statement.trim())
      .filter(Boolean),
  }));

const body = `/* Written by scripts/bundle-migrations.mjs from the files in drizzle/. Do not edit by hand: run pnpm db:generate. */

export interface Migration {
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = ${JSON.stringify(migrations, null, 2)};
`;
writeFileSync(target, body);
console.log(`Bundled ${migrations.length} migration(s).`);
