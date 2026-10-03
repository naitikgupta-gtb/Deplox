import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DEPLOX_DATABASE_URL ?? 'postgres://deplox:deplox@localhost:5432/deplox',
  },
  strict: true,
  verbose: true,
} satisfies Config;