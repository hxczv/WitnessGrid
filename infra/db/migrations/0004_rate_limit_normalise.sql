-- 0004: normalise rate_limit to the shape expected by the backend.
--
-- Databases created before the migration system existed carry a legacy
-- rate_limit (count column, no window_start). 0003's CREATE TABLE IF NOT
-- EXISTS silently skipped it, so the backend's rate-limit upsert fails.
-- For fresh databases this block is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rate_limit' AND column_name = 'count'
  ) THEN
    ALTER TABLE rate_limit RENAME COLUMN count TO hits;
    ALTER TABLE rate_limit ADD COLUMN window_start timestamptz NOT NULL DEFAULT now();
    -- Legacy rows keep their reset_at; backfill window_start from reset_at
    -- so existing buckets continue counting from their original window.
    UPDATE rate_limit SET window_start = reset_at - make_interval(secs => 60);
  END IF;
END $$;
