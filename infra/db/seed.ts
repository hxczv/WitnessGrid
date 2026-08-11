import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/witnessgrid';

// 1x1 placeholder images written to each seeded media key so the local object
// store can serve dev media without a real upload. Bytes are matched to the
// key's extension so the served content-type decodes (the store derives the
// content-type from the key; browsers honour the nosniff header). The sha256
// column is only a de-dup key, not a content check.
const PLACEHOLDER_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function placeholderForKey(key: string): Buffer {
  return /\.png$/i.test(key) ? PLACEHOLDER_PNG : PLACEHOLDER_JPEG;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  let sql: postgres.Sql | undefined;
  try {
    sql = postgres(url, { max: 1 });
    await sql`select 1`;
  } catch (err) {
    console.error(
      'DATABASE_URL unreachable — install & start PostgreSQL + PostGIS, then run `pnpm seed` from the repository root.'
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

    const mediaRows = await sql<
      { url: string; thumbnail_url: string | null }[]
    >`SELECT url, thumbnail_url FROM media WHERE url LIKE 'records/%'`;
    const mediaDir = process.env.LOCAL_MEDIA_DIR
      ? path.resolve(process.env.LOCAL_MEDIA_DIR)
      : path.resolve(__dirname, '../../backend/.media');
    for (const row of mediaRows) {
      for (const key of [row.url, row.thumbnail_url]) {
        if (!key) continue;
        const filePath = path.join(mediaDir, ...key.split('/'));
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, placeholderForKey(key));
      }
    }
    console.log(`Materialised ${mediaRows.length} seed media objects under ${mediaDir}.`);
  } catch (err) {
    console.error('Seed failed. If tables are missing, run `pnpm migrate` from the repository root first.');
    console.error(err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

await main();