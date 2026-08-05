const env = process.env;

if (env.RUN_DB_TESTS === '1' && !env.DATABASE_URL) {
  throw new Error('RUN_DB_TESTS=1 requires DATABASE_URL to be set');
}

// Unit tests run without a live database; point config at an unreachable URL.
// porsager connects lazily, so merely importing the app never touches the DB.
env.DATABASE_URL ??= 'postgres://postgres:postgres@localhost:5432/witnessgrid_unused';
env.JWT_SECRET ??= 'unit-test-secret-unit-test-secret-unit-test-secret';
env.PUBLIC_ORIGIN ??= 'http://localhost:3000';
env.BASE_URL = /^https?:\/\//.test(env.BASE_URL ?? '') ? env.BASE_URL : 'http://localhost:8787';