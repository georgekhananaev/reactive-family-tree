import { defineConfig } from 'drizzle-kit';

/* Used only to write migrations from the schema: pnpm db:generate */
export default defineConfig({
  dialect: 'sqlite',
  schema: ['./src/schema.ts', './src/auth-schema.ts'],
  out: './drizzle',
});
