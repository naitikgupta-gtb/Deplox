import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadConfig } from '@deplox/shared-config';
import * as schema from './schema.js';

const cfg = loadConfig();

const pool = new pg.Pool({
  connectionString: cfg.DEPLOX_DATABASE_URL,
  max: 10,
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;

export { schema };