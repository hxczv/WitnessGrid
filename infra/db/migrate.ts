import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/witnessgrid';
const ADVISORY_LOCK_KEY = 'witnessgrid-migrations';

export function databaseUrl(env: NodeJS.ProcessEnv): string {
  return env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
}

export function isDryRun(argv: string[]): boolean {
  return argv.includes('--dry-run');
}

export async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries.filter((f) => f.endsWith('.sql')).sort();
}

export function pendingMigrations(files: string[], applied: ReadonlySet<string>): string[] {
  return files.filter((f) => !applied.has(f));
}

export function fileChecksum(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

async function main(): Promise<void> {
  const dryRun = isDryRun(process.argv.slice(2));
  const files = await listMigrationFiles(MIGRATIONS_DIR);

  if (dryRun) {
    console.log('Dry run: no database connection established.');
    console.log(`Migrations directory: ${MIGRATIONS_DIR}`);
    if (files.length === 0) {
      console.log('No migration files found.');
      return;
    }
    console.log(
      'The following migrations would run (already-applied tracking requires a live database, so all files are listed):'
    );
    for (const f of files) console.log(`  ${f}`);
    console.log(`Total: ${files.length}`);
    return;
  }

  const url = databaseUrl(process.env);
  let sql: postgres.Sql | undefined;
  try {
    sql = postgres(url, { max: 1 });
    await sql`select 1`;
  } catch (err) {
    console.error(
      'DATABASE_URL unreachable — install & start PostgreSQL + PostGIS, then run `pnpm migrate` from the repository root.'
    );
    console.error(`DATABASE_URL=${url}`);
    console.error(err);
    process.exit(1);
  }

  try {
    // Session-level advisory lock on the single pooled connection: two
    // concurrent migrate runs serialize instead of racing on the inserts.
    await sql.unsafe('select pg_advisory_lock(hashtext($1))', [ADVISORY_LOCK_KEY]);

    await sql`create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now(),
      checksum text
    )`;
    await sql`alter table schema_migrations add column if not exists checksum text`;

    const appliedRows = await sql<Array<{ filename: string; checksum: string | null }>>`
      select filename, checksum from schema_migrations
    `;
    const applied = new Map<string, string | null>(appliedRows.map((r) => [r.filename, r.checksum]));

    // A migration that changed after it was applied means history diverged.
    for (const f of files) {
      if (!applied.has(f)) continue;
      const content = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
      const checksum = fileChecksum(content);
      const recorded = applied.get(f);
      if (recorded === null || recorded === undefined) {
        await sql`update schema_migrations set checksum = ${checksum} where filename = ${f}`;
      } else if (recorded !== checksum) {
        throw new Error(
          `migration ${f} was modified after it was applied (checksum mismatch). ` +
            'Migrations are immutable — add a new migration instead.'
        );
      }
    }

    const pending = pendingMigrations(files, new Set(applied.keys()));
    if (pending.length === 0) {
      console.log('schema_migrations is up to date — nothing to run.');
      return;
    }

    console.log(`Applying ${pending.length} migration(s):`);
    for (const f of pending) {
      const sqlText = await readFile(path.join(MIGRATIONS_DIR, f), 'utf8');
      await sql.begin(async (tx) => {
        await tx.unsafe(sqlText);
        await tx`insert into schema_migrations (filename, checksum) values (${f}, ${fileChecksum(sqlText)})`;
      });
      console.log(`  applied ${f}`);
    }
    console.log('Done.');
  } catch (err) {
    console.error('Migration failed. See error below — no partial migrations were recorded.');
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

const isMain =
  typeof process.argv[1] === 'string' &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) await main();
