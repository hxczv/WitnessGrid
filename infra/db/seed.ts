import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/witnessgrid';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  let sql: postgres.Sql | undefined;
  try {
    sql = postgres(url, { max: 1 });
    await sql`select 1`;
  } catch (err) {
    console.error(
      'DATABASE_URL unreachable — install & start PostgreSQL + PostGIS, then run `pnpm seed` from the infra package (cd infra && pnpm seed).'
    );
    console.error(`DATABASE_URL=${url}`);
    console.error(err);
    process.exit(1);
  }

  const seedPath = path.join(__dirname, 'seed.sql');
  const seedText = await readFile(seedPath, 'utf8');

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(seedText);
    });
    console.log(`Seed applied (${seedPath}).`);
  } catch (err) {
    console.error('Seed failed. If tables are missing, run `pnpm migrate` from the infra package first.');
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

await main();