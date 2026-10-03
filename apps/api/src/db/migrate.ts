/**
 * Runs all pending SQL migrations from src/db/migrations/*.sql against
 * DEPLOX_DATABASE_URL. Designed to be called as `pnpm db:migrate`.
 *
 * We deliberately avoid `drizzle-kit migrate` because it requires the
 * generated `_journal.json` to be present; for the first push we ship
 * hand-written SQL that's safe to re-run.
 */

import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import pg from 'pg';
import { loadConfig } from '@deplox/shared-config';
import { childLogger } from '@deplox/shared-logger';

const log = childLogger({ component: 'db-migrate' });
const cfg = loadConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, 'migrations');

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: cfg.DEPLOX_DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _deplox_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    const applied = await client.query<{ id: string }>(
      `SELECT id FROM _deplox_migrations ORDER BY id ASC`,
    );
    const appliedSet = new Set(applied.rows.map((r) => r.id));

    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (appliedSet.has(file)) {
        log.debug({ file }, 'migration already applied, skipping');
        continue;
      }
      const sql = await readFile(join(MIGRATIONS_DIR, file), 'utf8');
      log.info({ file }, 'applying migration');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO _deplox_migrations (id) VALUES ($1)`, [file]);
        await client.query('COMMIT');
        count += 1;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }

    log.info({ count }, 'migrations complete');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  log.error({ err }, 'migration failed');
  process.exit(1);
});