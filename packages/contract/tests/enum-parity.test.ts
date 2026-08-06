import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  INCIDENT_TYPES,
  MODERATION_STATUSES,
  POLICE_FORCES,
  REPORT_REASONS,
} from '../src/enums';

// The Postgres enums in infra/db/migrations are created by hand; this guard
// fails CI when the contract and the database drift apart.

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'infra', 'db', 'migrations');

function sqlEnumValues(): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    for (const match of sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([^)]*)\)/g)) {
      const name = match[1];
      const body = match[2];
      if (name === undefined || body === undefined) continue;
      const values = [...body.matchAll(/'([^']*)'/g)]
        .map((v) => v[1])
        .filter((v): v is string => v !== undefined);
      if (!byName.has(name)) byName.set(name, values);
    }
  }
  return byName;
}

describe('contract enums match the Postgres enums', () => {
  const dbEnums = sqlEnumValues();

  const cases: Array<[string, readonly string[]]> = [
    ['incident_type', INCIDENT_TYPES],
    ['police_force', POLICE_FORCES],
    ['moderation_status', MODERATION_STATUSES],
    ['report_reason', REPORT_REASONS],
  ];

  it.each(cases)('matches for %s', (sqlName, contractValues) => {
    const dbValues = dbEnums.get(sqlName);
    expect(dbValues, `SQL enum ${sqlName} not found in migrations`).toBeDefined();
    expect([...contractValues]).toEqual(dbValues);
  });
});
