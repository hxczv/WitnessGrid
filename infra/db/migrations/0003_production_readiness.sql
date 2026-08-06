-- 0003_production_readiness.sql — cleanup and hardening migration.
-- Removes schema that was created speculatively and never wired up (the
-- roadmap re-adds tables when the features that need them are actually
-- built), fixes the media dedup constraint, gives every writer a
-- moderation_tsv value via trigger, and moves the operational tables
-- (rate limiting, upload grants) into the migrations where schema belongs.

-- 1. Drop never-used schema. comments/audit_log have no routes or repo
-- functions; cluster_id/password_hash/subscription columns have no readers.
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS audit_log;
ALTER TABLE incidents DROP COLUMN IF EXISTS cluster_id;
ALTER TABLE users DROP COLUMN IF EXISTS subscription_tier;
ALTER TABLE users DROP COLUMN IF EXISTS supporter_since;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
DROP TYPE IF EXISTS subscription_tier;

-- 2. Media dedup. The previous UNIQUE(sha256) was global, which blocked two
-- unrelated incidents from ever containing the same photo. Dedup only makes
-- sense within one incident.
ALTER TABLE media DROP CONSTRAINT IF EXISTS media_sha256_key;
ALTER TABLE media ADD CONSTRAINT media_incident_sha256_key UNIQUE (incident_id, sha256);

-- 3. moderation_tsv trigger. Seed rows and any future writer now get a
-- tsvector without remembering to set it (seeded rows previously stayed
-- NULL and were invisible to search).
CREATE OR REPLACE FUNCTION incidents_moderation_tsv() RETURNS trigger AS $$
BEGIN
  NEW.moderation_tsv := to_tsvector('english', coalesce(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incidents_moderation_tsv_trg ON incidents;
CREATE TRIGGER incidents_moderation_tsv_trg
  BEFORE INSERT OR UPDATE OF description ON incidents
  FOR EACH ROW EXECUTE FUNCTION incidents_moderation_tsv();

UPDATE incidents SET moderation_tsv = to_tsvector('english', coalesce(description, ''))
WHERE moderation_tsv IS NULL;

-- 4. Rate limiting state. Previously created lazily by backend code, which
-- meant schema could drift between the app and the migrations.
CREATE TABLE IF NOT EXISTS rate_limit (
  bucket text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  hits integer NOT NULL DEFAULT 1,
  reset_at timestamptz NOT NULL
);

-- 5. Upload grants. Every issued object key is bound to the user who
-- requested it; incident creation consumes the grant and verifies the
-- server-computed hash (local mode). No RLS: this is an operational table
-- the privileged backend owns end to end.
CREATE TABLE IF NOT EXISTS media_grants (
  key text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content_type text NOT NULL,
  sha256 char(64),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_grants_created_idx ON media_grants(created_at);
