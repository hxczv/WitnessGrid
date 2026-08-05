-- 0002_phase2.sql — WitnessGrid Phase 2: ratings identity, search, saved-area alerts,
-- and account-deletion semantics. Follows the 0001 conventions: RLS as a
-- forward-compatible guardrail only (the backend enforces ownership), and the
-- search tsvector computed in SQL because PostgreSQL 18 rejects enum-derived
-- expressions in GENERATED ALWAYS columns (42P17; see the 0001 note).

-- 1. ratings: add the owner + uniqueness — one rating per user per incident.
-- The table is empty at this point in the deployment history, so the NOT NULL
-- column is added directly.
ALTER TABLE ratings ADD COLUMN user_id uuid REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE ratings ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE ratings ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE ratings ADD CONSTRAINT ratings_user_incident_unique UNIQUE (user_id, incident_id);
CREATE INDEX ratings_incident_idx ON ratings(incident_id);

-- 2. incidents: a deleted account keeps its records but loses the identity link.
ALTER TABLE incidents DROP CONSTRAINT incidents_user_id_fkey;
ALTER TABLE incidents ADD CONSTRAINT incidents_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE incidents ALTER COLUMN user_id DROP NOT NULL;

-- 3. search: moderation_tsv over the description, kept fresh by the backend
-- (description is the only searchable free-text field in Phase 2).
ALTER TABLE incidents ADD COLUMN moderation_tsv tsvector;
UPDATE incidents SET moderation_tsv = to_tsvector('english', coalesce(description, ''));
CREATE INDEX incidents_search_idx ON incidents USING gin (moderation_tsv);

-- 4. saved areas: display name + owner lookup index.
ALTER TABLE saved_areas ADD COLUMN name text NOT NULL DEFAULT '';
CREATE INDEX saved_areas_user_idx ON saved_areas(user_id);

-- 5. saved-area alerts: one row per (user, incident) so a record inside N
-- overlapping saved areas still yields a single alert + email.
CREATE TABLE saved_area_alerts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  area_id uuid NOT NULL REFERENCES saved_areas(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, incident_id)
);
CREATE INDEX saved_area_alerts_user_idx ON saved_area_alerts(user_id, created_at DESC);

-- 6. RLS guardrails mirroring 0001 (auth.uid() is a placeholder until PostgREST
-- wiring; the backend is the privileged app client and enforces ownership).
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY ratings_read_public ON ratings FOR SELECT USING (true);
CREATE POLICY ratings_write_owner ON ratings FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
ALTER TABLE saved_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_areas_owner_all ON saved_areas FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
ALTER TABLE saved_area_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY saved_area_alerts_owner_read ON saved_area_alerts FOR SELECT
  USING (user_id = auth.uid());
GRANT SELECT ON ratings, saved_areas, saved_area_alerts TO anon; -- documented only (see 0001)
