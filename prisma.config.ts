import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';

// Same file `next dev` reads, so local migrations need no extra setup. Absent in Docker/CI.
if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');

// `prisma generate` runs at install and build time without a database, so the URL is optional here.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
