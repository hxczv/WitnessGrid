import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { databaseUrl, fileChecksum, isDryRun, listMigrationFiles, pendingMigrations } from './migrate.js';

test('isDryRun detects --dry-run flag', () => {
  assert.equal(isDryRun(['--dry-run']), true);
  assert.equal(isDryRun([]), false);
  assert.equal(isDryRun(['--foo', '--bar']), false);
  assert.equal(isDryRun(['--foo', '--dry-run', '--bar']), true);
});

test('databaseUrl falls back to the local dev default', () => {
  assert.equal(databaseUrl({}), 'postgres://postgres:postgres@localhost:5432/witnessgrid');
  assert.equal(
    databaseUrl({ DATABASE_URL: 'postgres://user:pw@example.com:5433/db' }),
    'postgres://user:pw@example.com:5433/db'
  );
});

test('listMigrationFiles returns only .sql files in sorted order', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wg-migrate-'));
  try {
    await writeFile(path.join(dir, '0002_second.sql'), '');
    await writeFile(path.join(dir, '0001_first.sql'), '');
    await writeFile(path.join(dir, '0003_third.sql'), '');
    await writeFile(path.join(dir, 'notes.txt'), 'not a migration');
    const files = await listMigrationFiles(dir);
    assert.deepEqual(files, ['0001_first.sql', '0002_second.sql', '0003_third.sql']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('listMigrationFiles returns [] for an empty directory', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'wg-migrate-empty-'));
  try {
    await mkdir(path.join(dir, 'nested'));
    assert.deepEqual(await listMigrationFiles(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('pendingMigrations filters out already-applied files', () => {
  const files = ['0001_init.sql', '0002_second.sql'];
  assert.deepEqual(pendingMigrations(files, new Set(['0001_init.sql'])), ['0002_second.sql']);
  assert.deepEqual(pendingMigrations(files, new Set(['0001_init.sql', '0002_second.sql'])), []);
  assert.deepEqual(pendingMigrations(files, new Set()), files);
});

test('fileChecksum is deterministic and content-sensitive', () => {
  assert.equal(fileChecksum('SELECT 1;'), fileChecksum('SELECT 1;'));
  assert.notEqual(fileChecksum('SELECT 1;'), fileChecksum('SELECT 2;'));
  assert.match(fileChecksum('SELECT 1;'), /^[0-9a-f]{64}$/);
});
