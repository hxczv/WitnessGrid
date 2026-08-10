-- 0005: add ratings.updated_at, written by upsertRating but absent from
-- every previous migration. Any fresh database would 500 on rating
-- upserts (42703); legacy databases lack the column for the same reason.
ALTER TABLE ratings ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
