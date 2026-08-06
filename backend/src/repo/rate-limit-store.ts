import { db } from '../db.js';

// The rate_limit table is created by the infra migrations (0003). Rows are
// opportunistically pruned once their window has passed.

export interface RateLimitHitResult {
  hits: number;
  resetAt: Date;
}

export async function rateLimitHit(bucket: string, windowSeconds: number): Promise<RateLimitHitResult> {
  const rows = await db<Array<{ hits: number; reset_at: Date }>>`
    INSERT INTO rate_limit (bucket, window_start, hits, reset_at)
    VALUES (${bucket}, now(), 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (bucket) DO UPDATE SET
      hits = CASE WHEN rate_limit.reset_at <= now() THEN 1 ELSE rate_limit.hits + 1 END,
      window_start = CASE WHEN rate_limit.reset_at <= now() THEN now() ELSE rate_limit.window_start END,
      reset_at = CASE WHEN rate_limit.reset_at <= now()
        THEN now() + make_interval(secs => ${windowSeconds})
        ELSE rate_limit.reset_at END
    RETURNING hits, reset_at
  `;
  const row = rows[0];
  if (!row) throw new Error('rate limit upsert returned no row');

  // Cheap opportunistic prune: the table only ever holds one row per bucket.
  db`DELETE FROM rate_limit WHERE reset_at <= now()`.catch(() => undefined);

  return { hits: row.hits, resetAt: row.reset_at };
}
