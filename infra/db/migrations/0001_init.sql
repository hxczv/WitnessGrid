-- 0001_init.sql — WitnessGrid core schema (PostgreSQL + PostGIS).
-- Re-runnable-safe where practical: enum creation is guarded with IF NOT EXISTS checks,
-- extension creation uses IF NOT EXISTS, and a placeholder `anon` role is created if
-- absent so the documented public-read GRANTs below apply on a fresh cluster.
-- RLS is a forward-compatible guardrail only; the backend connects with a privileged
-- role in Phase 1 and enforces ownership itself. See the phase 1 plan notes.

CREATE SCHEMA IF NOT EXISTS auth;

-- No-op helper so RLS policies referencing auth.uid() can be created without Supabase.
-- The backend is the privileged application client in Phase 1; this function is a
-- placeholder until a PostgREST-style auth wiring exists.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid AS $$ SELECT NULL::uuid $$ LANGUAGE sql;

CREATE EXTENSION IF NOT EXISTS postgis;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'incident_type') THEN
    CREATE TYPE incident_type AS ENUM ('stop_and_search','vehicle_stop','arrest','use_of_force','stop_and_question','traffic_collision','missing_person','other');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'police_force') THEN
    CREATE TYPE police_force AS ENUM ('avon-and-somerset','bedfordshire','cambridgeshire','cheshire','city-of-london','cleveland','cumbria','derbyshire','devon-and-cornwall','dorset','durham','dyfed-powys','essex','gloucestershire','greater-manchester','gwent','hampshire','hertfordshire','humberside','kent','lancashire','leicestershire','lincolnshire','merseyside','metropolitan','norfolk','north-wales','north-yorkshire','northamptonshire','northumbria','nottinghamshire','south-wales','south-yorkshire','staffordshire','suffolk','surrey','sussex','thames-valley','warwickshire','west-mercia','west-midlands','west-yorkshire','wiltshire','police-scotland','psni','british-transport-police','ministry-of-defence','civil-nuclear','other');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'moderation_status') THEN
    CREATE TYPE moderation_status AS ENUM ('pending','approved','removed');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_tier') THEN
    CREATE TYPE subscription_tier AS ENUM ('free','supporter');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'report_reason') THEN
    CREATE TYPE report_reason AS ENUM ('illegal_content','harassment','misinformation','privacy','other');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
END $$;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE COLLATE "C",
  email text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  supporter_since timestamptz,
  password_hash text
);

CREATE TABLE magic_link_tokens (
  token_hash text PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX magic_link_tokens_email_idx ON magic_link_tokens(email);

CREATE TABLE incidents (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL UNIQUE,
  type incident_type NOT NULL,
  police_force police_force NOT NULL,
  location geography(Point,4326) NOT NULL,
  location_accuracy_m real,
  "timestamp" timestamptz NOT NULL,
  description text NOT NULL DEFAULT '',
  officer_count smallint,
  created_at timestamptz NOT NULL DEFAULT now(),
  view_count integer NOT NULL DEFAULT 0,
  cluster_id uuid,
  moderation_status moderation_status NOT NULL DEFAULT 'approved',
  moderation_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', description || ' ' || type::text || ' ' || police_force::text)) STORED
);
CREATE INDEX incidents_location_idx ON incidents USING gist (location);
CREATE INDEX incidents_tsv_idx ON incidents USING gin (moderation_tsv);
CREATE INDEX incidents_created_idx ON incidents (moderation_status, created_at DESC);

CREATE TABLE media (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  url text NOT NULL,
  type text NOT NULL,
  sha256 text NOT NULL UNIQUE,
  thumbnail_url text
);

CREATE TABLE ratings (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  appropriateness smallint NOT NULL CHECK (appropriateness BETWEEN 1 AND 5),
  professionalism smallint NOT NULL CHECK (professionalism BETWEEN 1 AND 5),
  safety smallint NOT NULL CHECK (safety BETWEEN 1 AND 5)
);

CREATE TABLE officers (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  collar_number text NOT NULL
);

CREATE TABLE comments (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  moderation_status moderation_status NOT NULL DEFAULT 'approved'
);

CREATE TABLE saved_areas (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bounds geography(Polygon,4326) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE report_flags (
  id uuid PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  detail text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX report_flags_incident_idx ON report_flags(incident_id);

CREATE TABLE audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor uuid,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
-- RLS policies: public read on approved incidents + their media; owner write.
CREATE POLICY incidents_read_approved ON incidents FOR SELECT USING (moderation_status = 'approved');
CREATE POLICY incidents_write_owner ON incidents FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY media_read_approved ON media FOR SELECT USING (incident_id IN (SELECT id FROM incidents WHERE moderation_status='approved'));
CREATE POLICY media_write_owner ON media FOR ALL USING (incident_id IN (SELECT id FROM incidents WHERE user_id = auth.uid()));
GRANT SELECT ON incidents, media TO anon; -- documented only (auth.uid() is a placeholder until PostgREST wiring; worker is the privileged app client in Phase 1)