import { defineConfig } from 'prisma/config';

// `prisma generate` runs at install and build time without a database, so the URL is optional here.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
